use crate::domain::{PriceTicks, QtyLots, Side};
use std::fmt;

// ANCHOR: risk_model
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OrderIntent {
    pub side: Side,
    pub price: PriceTicks,
    pub qty: QtyLots,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RiskSnapshot {
    pub enabled: bool,
    pub book_fresh: bool,
    pub book_tradable: bool,
    pub position_lots: i64,
    pub active_buy_lots: i64,
    pub uncertain_buy_lots: i64,
    pub active_sell_lots: i64,
    pub uncertain_sell_lots: i64,
    pub max_abs_position_lots: i64,
    pub max_order_lots: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskSnapshotError {
    NegativeOpenExposure,
    InvalidLimits,
}

impl fmt::Display for RiskSnapshotError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NegativeOpenExposure => {
                f.write_str("active and uncertain exposure cannot be negative")
            }
            Self::InvalidLimits => {
                f.write_str("position limit must be non-negative and order limit positive")
            }
        }
    }
}

impl std::error::Error for RiskSnapshotError {}

impl RiskSnapshot {
    pub fn validate(self) -> Result<(), RiskSnapshotError> {
        if self.active_buy_lots < 0
            || self.uncertain_buy_lots < 0
            || self.active_sell_lots < 0
            || self.uncertain_sell_lots < 0
        {
            return Err(RiskSnapshotError::NegativeOpenExposure);
        }
        if self.max_abs_position_lots < 0 || self.max_order_lots <= 0 {
            return Err(RiskSnapshotError::InvalidLimits);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskDecision {
    Allow,
    Resize { max_qty_lots: i64 },
    Reject(&'static str),
}
// ANCHOR_END: risk_model

// ANCHOR: risk_check
pub fn worst_long(snapshot: RiskSnapshot) -> i128 {
    i128::from(snapshot.position_lots)
        + i128::from(snapshot.active_buy_lots)
        + i128::from(snapshot.uncertain_buy_lots)
}

pub fn worst_short(snapshot: RiskSnapshot) -> i128 {
    i128::from(snapshot.position_lots)
        - i128::from(snapshot.active_sell_lots)
        - i128::from(snapshot.uncertain_sell_lots)
}

pub fn check(intent: OrderIntent, snapshot: RiskSnapshot) -> RiskDecision {
    if let Err(error) = snapshot.validate() {
        return RiskDecision::Reject(match error {
            RiskSnapshotError::NegativeOpenExposure => "invalid_exposure",
            RiskSnapshotError::InvalidLimits => "invalid_limits",
        });
    }
    if !snapshot.enabled {
        return RiskDecision::Reject("trading_disabled");
    }
    if !snapshot.book_fresh {
        return RiskDecision::Reject("stale_market_data");
    }
    if !snapshot.book_tradable {
        return RiskDecision::Reject("untradable_book");
    }
    let order_cap = intent.qty.get().min(snapshot.max_order_lots);
    let position_cap = match intent.side {
        Side::Buy => i128::from(snapshot.max_abs_position_lots) - worst_long(snapshot),
        Side::Sell => worst_short(snapshot) + i128::from(snapshot.max_abs_position_lots),
    }
    .clamp(0, i128::from(i64::MAX)) as i64;
    let allowed = order_cap.min(position_cap);

    if allowed <= 0 {
        RiskDecision::Reject("position_limit")
    } else if allowed < intent.qty.get() {
        RiskDecision::Resize {
            max_qty_lots: allowed,
        }
    } else {
        RiskDecision::Allow
    }
}
// ANCHOR_END: risk_check
