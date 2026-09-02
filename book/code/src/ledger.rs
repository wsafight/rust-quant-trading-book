use std::collections::BTreeMap;
use std::fmt;

use crate::domain::{ExecutionKey, PriceTicks, QtyLots, Side};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rational {
    numerator: i128,
    denominator: i128,
}

impl Rational {
    pub const ZERO: Self = Self {
        numerator: 0,
        denominator: 1,
    };

    pub fn new(numerator: i128, denominator: i128) -> Result<Self, LedgerError> {
        if denominator == 0 {
            return Err(LedgerError::ArithmeticOverflow);
        }
        let (numerator, denominator) = if denominator < 0 {
            (
                numerator
                    .checked_neg()
                    .ok_or(LedgerError::ArithmeticOverflow)?,
                denominator
                    .checked_neg()
                    .ok_or(LedgerError::ArithmeticOverflow)?,
            )
        } else {
            (numerator, denominator)
        };
        if numerator == 0 {
            return Ok(Self::ZERO);
        }
        let divisor = gcd(numerator.unsigned_abs(), denominator as u128) as i128;
        Ok(Self {
            numerator: numerator / divisor,
            denominator: denominator / divisor,
        })
    }

    pub const fn from_integer(value: i128) -> Self {
        Self {
            numerator: value,
            denominator: 1,
        }
    }

    pub const fn numerator(self) -> i128 {
        self.numerator
    }

    pub const fn denominator(self) -> i128 {
        self.denominator
    }

    pub fn checked_add(self, rhs: Self) -> Result<Self, LedgerError> {
        let left = self
            .numerator
            .checked_mul(rhs.denominator)
            .ok_or(LedgerError::ArithmeticOverflow)?;
        let right = rhs
            .numerator
            .checked_mul(self.denominator)
            .ok_or(LedgerError::ArithmeticOverflow)?;
        let numerator = left
            .checked_add(right)
            .ok_or(LedgerError::ArithmeticOverflow)?;
        let denominator = self
            .denominator
            .checked_mul(rhs.denominator)
            .ok_or(LedgerError::ArithmeticOverflow)?;
        Self::new(numerator, denominator)
    }

    pub fn checked_sub(self, rhs: Self) -> Result<Self, LedgerError> {
        self.checked_add(Self::new(
            rhs.numerator
                .checked_neg()
                .ok_or(LedgerError::ArithmeticOverflow)?,
            rhs.denominator,
        )?)
    }

    pub fn checked_mul_integer(self, value: i128) -> Result<Self, LedgerError> {
        Self::new(
            self.numerator
                .checked_mul(value)
                .ok_or(LedgerError::ArithmeticOverflow)?,
            self.denominator,
        )
    }

    pub fn checked_div_integer(self, value: i128) -> Result<Self, LedgerError> {
        if value == 0 {
            return Err(LedgerError::ArithmeticOverflow);
        }
        Self::new(
            self.numerator,
            self.denominator
                .checked_mul(value)
                .ok_or(LedgerError::ArithmeticOverflow)?,
        )
    }
}

impl fmt::Display for Rational {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.denominator == 1 {
            write!(f, "{}", self.numerator)
        } else {
            write!(f, "{}/{}", self.numerator, self.denominator)
        }
    }
}

fn gcd(mut left: u128, mut right: u128) -> u128 {
    while right != 0 {
        let remainder = left % right;
        left = right;
        right = remainder;
    }
    left.max(1)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Fill {
    pub key: ExecutionKey,
    pub side: Side,
    pub price: PriceTicks,
    pub qty: QtyLots,
    /// A non-negative cost in the same quote unit as `price_ticks * qty_lots`.
    pub fee_quote: i128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplyOutcome {
    Applied,
    Duplicate,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LedgerError {
    NegativeFee,
    ArithmeticOverflow,
    ConflictingExecution(ExecutionKey),
}

impl fmt::Display for LedgerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NegativeFee => f.write_str("fill fee cannot be negative"),
            Self::ArithmeticOverflow => f.write_str("ledger arithmetic overflow"),
            Self::ConflictingExecution(key) => write!(
                f,
                "execution key was reused with different facts: {}/{}/{}/{}",
                key.venue, key.account, key.instrument, key.execution_id
            ),
        }
    }
}

impl std::error::Error for LedgerError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LedgerSnapshot {
    pub position_lots: i64,
    pub cash_quote: i128,
    pub open_cost_quote: Rational,
    pub realized_price_pnl_quote: Rational,
    pub fees_quote: i128,
    pub execution_count: usize,
}

#[derive(Debug, Clone)]
pub struct Ledger {
    starting_cash_quote: i128,
    position_lots: i64,
    cash_quote: i128,
    open_cost_quote: Rational,
    realized_price_pnl_quote: Rational,
    fees_quote: i128,
    executions: BTreeMap<ExecutionKey, Fill>,
}

impl Ledger {
    pub fn new(starting_cash_quote: i128) -> Self {
        Self {
            starting_cash_quote,
            position_lots: 0,
            cash_quote: starting_cash_quote,
            open_cost_quote: Rational::ZERO,
            realized_price_pnl_quote: Rational::ZERO,
            fees_quote: 0,
            executions: BTreeMap::new(),
        }
    }

    pub fn apply_fill(&mut self, fill: Fill) -> Result<ApplyOutcome, LedgerError> {
        if let Some(previous) = self.executions.get(&fill.key) {
            return if previous == &fill {
                Ok(ApplyOutcome::Duplicate)
            } else {
                Err(LedgerError::ConflictingExecution(fill.key))
            };
        }
        if fill.fee_quote < 0 {
            return Err(LedgerError::NegativeFee);
        }

        let notional = i128::from(fill.price.get())
            .checked_mul(i128::from(fill.qty.get()))
            .ok_or(LedgerError::ArithmeticOverflow)?;
        let signed_qty = match fill.side {
            Side::Buy => fill.qty.get(),
            Side::Sell => fill
                .qty
                .get()
                .checked_neg()
                .ok_or(LedgerError::ArithmeticOverflow)?,
        };
        let cash_change = match fill.side {
            Side::Buy => notional
                .checked_add(fill.fee_quote)
                .and_then(|value| value.checked_neg())
                .ok_or(LedgerError::ArithmeticOverflow)?,
            Side::Sell => notional
                .checked_sub(fill.fee_quote)
                .ok_or(LedgerError::ArithmeticOverflow)?,
        };

        let mut next = self.clone();
        next.cash_quote = next
            .cash_quote
            .checked_add(cash_change)
            .ok_or(LedgerError::ArithmeticOverflow)?;
        next.fees_quote = next
            .fees_quote
            .checked_add(fill.fee_quote)
            .ok_or(LedgerError::ArithmeticOverflow)?;
        next.apply_position(fill.side, fill.price, fill.qty)?;
        next.position_lots = next
            .position_lots
            .checked_add(signed_qty)
            .ok_or(LedgerError::ArithmeticOverflow)?;
        next.executions.insert(fill.key.clone(), fill);
        *self = next;
        Ok(ApplyOutcome::Applied)
    }

    fn apply_position(
        &mut self,
        side: Side,
        price: PriceTicks,
        qty: QtyLots,
    ) -> Result<(), LedgerError> {
        let fill_sign = match side {
            Side::Buy => 1,
            Side::Sell => -1,
        };
        let position_sign = self.position_lots.signum();
        let fill_notional = Rational::from_integer(
            i128::from(price.get())
                .checked_mul(i128::from(qty.get()))
                .ok_or(LedgerError::ArithmeticOverflow)?,
        );

        if position_sign == 0 || position_sign == fill_sign {
            self.open_cost_quote = self.open_cost_quote.checked_add(fill_notional)?;
            return Ok(());
        }

        let position_abs = i128::from(self.position_lots).abs();
        let fill_abs = i128::from(qty.get());
        let close_qty = position_abs.min(fill_abs);
        let average_cost = self.open_cost_quote.checked_div_integer(position_abs)?;
        let closed_cost = average_cost.checked_mul_integer(close_qty)?;
        let exit_notional = Rational::from_integer(
            i128::from(price.get())
                .checked_mul(close_qty)
                .ok_or(LedgerError::ArithmeticOverflow)?,
        );
        let price_pnl = if position_sign > 0 {
            exit_notional.checked_sub(closed_cost)?
        } else {
            closed_cost.checked_sub(exit_notional)?
        };
        self.realized_price_pnl_quote = self.realized_price_pnl_quote.checked_add(price_pnl)?;
        self.open_cost_quote = self.open_cost_quote.checked_sub(closed_cost)?;

        let opening_qty = fill_abs - close_qty;
        if opening_qty > 0 {
            debug_assert_eq!(self.open_cost_quote, Rational::ZERO);
            self.open_cost_quote = Rational::from_integer(
                i128::from(price.get())
                    .checked_mul(opening_qty)
                    .ok_or(LedgerError::ArithmeticOverflow)?,
            );
        }
        Ok(())
    }

    pub fn snapshot(&self) -> LedgerSnapshot {
        LedgerSnapshot {
            position_lots: self.position_lots,
            cash_quote: self.cash_quote,
            open_cost_quote: self.open_cost_quote,
            realized_price_pnl_quote: self.realized_price_pnl_quote,
            fees_quote: self.fees_quote,
            execution_count: self.executions.len(),
        }
    }

    pub fn equity_quote(&self, mark: PriceTicks) -> Result<i128, LedgerError> {
        self.cash_quote
            .checked_add(
                i128::from(self.position_lots)
                    .checked_mul(i128::from(mark.get()))
                    .ok_or(LedgerError::ArithmeticOverflow)?,
            )
            .ok_or(LedgerError::ArithmeticOverflow)
    }

    pub fn unrealized_price_pnl_quote(&self, mark: PriceTicks) -> Result<Rational, LedgerError> {
        let marked_notional = Rational::from_integer(
            i128::from(self.position_lots.unsigned_abs())
                .checked_mul(i128::from(mark.get()))
                .ok_or(LedgerError::ArithmeticOverflow)?,
        );
        if self.position_lots >= 0 {
            marked_notional.checked_sub(self.open_cost_quote)
        } else {
            self.open_cost_quote.checked_sub(marked_notional)
        }
    }

    pub fn verify_equity_identity(&self, mark: PriceTicks) -> Result<bool, LedgerError> {
        let equity_change = Rational::from_integer(
            self.equity_quote(mark)?
                .checked_sub(self.starting_cash_quote)
                .ok_or(LedgerError::ArithmeticOverflow)?,
        );
        let explained = self
            .realized_price_pnl_quote
            .checked_add(self.unrealized_price_pnl_quote(mark)?)?
            .checked_sub(Rational::from_integer(self.fees_quote))?;
        Ok(equity_change == explained)
    }

    /// Stable FNV-1a checksum over canonical ledger state and execution identities.
    pub fn state_checksum(&self) -> u64 {
        let mut hash = 0xcbf29ce484222325_u64;
        for value in [
            i128::from(self.position_lots),
            self.cash_quote,
            self.open_cost_quote.numerator,
            self.open_cost_quote.denominator,
            self.realized_price_pnl_quote.numerator,
            self.realized_price_pnl_quote.denominator,
            self.fees_quote,
        ] {
            for byte in value.to_le_bytes() {
                hash ^= u64::from(byte);
                hash = hash.wrapping_mul(0x100000001b3);
            }
        }
        for key in self.executions.keys() {
            for value in [
                key.venue.as_bytes(),
                key.account.as_bytes(),
                key.instrument.as_bytes(),
                key.execution_id.as_bytes(),
            ] {
                for &byte in value {
                    hash ^= u64::from(byte);
                    hash = hash.wrapping_mul(0x100000001b3);
                }
                hash ^= 0xff;
                hash = hash.wrapping_mul(0x100000001b3);
            }
        }
        hash
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn price(value: i64) -> PriceTicks {
        PriceTicks::new(value).unwrap()
    }

    fn qty(value: i64) -> QtyLots {
        QtyLots::new(value).unwrap()
    }

    fn fill(id: &str, side: Side, price_ticks: i64, qty_lots: i64, fee: i128) -> Fill {
        Fill {
            key: ExecutionKey::new("SIM", "paper", "BTC-USD", id),
            side,
            price: price(price_ticks),
            qty: qty(qty_lots),
            fee_quote: fee,
        }
    }

    #[test]
    fn average_cost_partial_close_and_reversal_close_exactly() {
        let mut ledger = Ledger::new(10_000);
        ledger
            .apply_fill(fill("buy-1", Side::Buy, 100, 2, 1))
            .unwrap();
        ledger
            .apply_fill(fill("buy-2", Side::Buy, 110, 3, 1))
            .unwrap();
        ledger
            .apply_fill(fill("sell-1", Side::Sell, 120, 2, 1))
            .unwrap();

        let snapshot = ledger.snapshot();
        assert_eq!(snapshot.position_lots, 3);
        assert_eq!(snapshot.open_cost_quote, Rational::from_integer(318));
        assert_eq!(
            snapshot.realized_price_pnl_quote,
            Rational::from_integer(28)
        );
        assert!(ledger.verify_equity_identity(price(115)).unwrap());

        ledger
            .apply_fill(fill("sell-2", Side::Sell, 90, 5, 1))
            .unwrap();
        let snapshot = ledger.snapshot();
        assert_eq!(snapshot.position_lots, -2);
        assert_eq!(snapshot.open_cost_quote, Rational::from_integer(180));
        assert_eq!(
            snapshot.realized_price_pnl_quote,
            Rational::from_integer(-20)
        );
        assert!(ledger.verify_equity_identity(price(80)).unwrap());
    }

    #[test]
    fn duplicate_is_idempotent_but_conflicting_reuse_is_an_error() {
        let mut ledger = Ledger::new(1_000);
        let first = fill("execution-1", Side::Buy, 100, 2, 1);
        assert_eq!(
            ledger.apply_fill(first.clone()).unwrap(),
            ApplyOutcome::Applied
        );
        let checksum = ledger.state_checksum();
        assert_eq!(ledger.apply_fill(first).unwrap(), ApplyOutcome::Duplicate);
        assert_eq!(ledger.state_checksum(), checksum);

        assert!(matches!(
            ledger.apply_fill(fill("execution-1", Side::Buy, 101, 2, 1)),
            Err(LedgerError::ConflictingExecution(_))
        ));
        assert_eq!(ledger.state_checksum(), checksum);
    }
}
