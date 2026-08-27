use std::collections::BTreeMap;
use std::fmt;

use crate::domain::PriceTicks;

pub type Level = (PriceTicks, i64);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Snapshot {
    pub sequence: u64,
    pub bids: Vec<Level>,
    pub asks: Vec<Level>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Delta {
    pub first_sequence: u64,
    pub last_sequence: u64,
    pub bids: Vec<Level>,
    pub asks: Vec<Level>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BookError {
    InvalidLevelQty(i64),
    InvalidSequenceRange { first: u64, last: u64 },
    SequenceGap { expected: u64, received: u64 },
    CrossedBook { best_bid: i64, best_ask: i64 },
    NeedsSnapshot,
}

impl fmt::Display for BookError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidLevelQty(qty) => write!(f, "level quantity cannot be negative: {qty}"),
            Self::InvalidSequenceRange { first, last } => {
                write!(f, "invalid sequence range: {first}..={last}")
            }
            Self::SequenceGap { expected, received } => {
                write!(f, "sequence gap: expected {expected}, received {received}")
            }
            Self::CrossedBook { best_bid, best_ask } => {
                write!(f, "crossed book: best bid {best_bid}, best ask {best_ask}")
            }
            Self::NeedsSnapshot => f.write_str("book needs a fresh snapshot"),
        }
    }
}

impl std::error::Error for BookError {}

#[derive(Debug, Clone, Default)]
pub struct OrderBook {
    bids: BTreeMap<PriceTicks, i64>,
    asks: BTreeMap<PriceTicks, i64>,
    last_sequence: Option<u64>,
    valid: bool,
}

impl OrderBook {
    pub fn apply_snapshot(&mut self, snapshot: Snapshot) -> Result<(), BookError> {
        let mut bids = BTreeMap::new();
        let mut asks = BTreeMap::new();
        if let Err(error) = apply_levels(&mut bids, snapshot.bids)
            .and_then(|_| apply_levels(&mut asks, snapshot.asks))
            .and_then(|_| validate_spread(&bids, &asks))
        {
            self.valid = false;
            return Err(error);
        }

        self.bids = bids;
        self.asks = asks;
        self.last_sequence = Some(snapshot.sequence);
        self.valid = true;
        Ok(())
    }

    pub fn apply_delta(&mut self, delta: Delta) -> Result<(), BookError> {
        let Some(last_sequence) = self.last_sequence else {
            return Err(BookError::NeedsSnapshot);
        };
        if !self.valid {
            return Err(BookError::NeedsSnapshot);
        }
        if delta.first_sequence > delta.last_sequence {
            self.valid = false;
            return Err(BookError::InvalidSequenceRange {
                first: delta.first_sequence,
                last: delta.last_sequence,
            });
        }

        let expected = last_sequence.saturating_add(1);
        if !(delta.first_sequence <= expected && expected <= delta.last_sequence) {
            self.valid = false;
            return Err(BookError::SequenceGap {
                expected,
                received: delta.first_sequence,
            });
        }

        let mut bids = self.bids.clone();
        let mut asks = self.asks.clone();
        if let Err(error) = apply_levels(&mut bids, delta.bids)
            .and_then(|_| apply_levels(&mut asks, delta.asks))
            .and_then(|_| validate_spread(&bids, &asks))
        {
            self.valid = false;
            return Err(error);
        }

        self.bids = bids;
        self.asks = asks;
        self.last_sequence = Some(delta.last_sequence);
        Ok(())
    }

    pub fn best_bid(&self) -> Option<Level> {
        self.valid
            .then(|| {
                self.bids
                    .last_key_value()
                    .map(|(price, qty)| (*price, *qty))
            })
            .flatten()
    }

    pub fn best_ask(&self) -> Option<Level> {
        self.valid
            .then(|| {
                self.asks
                    .first_key_value()
                    .map(|(price, qty)| (*price, *qty))
            })
            .flatten()
    }

    /// Reports that the latest snapshot/delta chain passed structural checks.
    pub const fn is_structurally_valid(&self) -> bool {
        self.valid
    }

    /// Reports whether both sides have a usable top level for trading.
    /// Freshness is a separate, timestamp-based decision owned by the caller.
    pub fn is_tradable(&self) -> bool {
        self.valid && self.best_bid().is_some() && self.best_ask().is_some()
    }

    /// Backwards-compatible alias for structural validity.
    pub const fn is_valid(&self) -> bool {
        self.is_structurally_valid()
    }

    pub const fn last_sequence(&self) -> Option<u64> {
        self.last_sequence
    }
}

fn apply_levels(book: &mut BTreeMap<PriceTicks, i64>, levels: Vec<Level>) -> Result<(), BookError> {
    for (price, qty) in levels {
        match qty {
            ..=-1 => return Err(BookError::InvalidLevelQty(qty)),
            0 => {
                book.remove(&price);
            }
            _ => {
                book.insert(price, qty);
            }
        }
    }
    Ok(())
}

fn validate_spread(
    bids: &BTreeMap<PriceTicks, i64>,
    asks: &BTreeMap<PriceTicks, i64>,
) -> Result<(), BookError> {
    if let (Some((bid, _)), Some((ask, _))) = (bids.last_key_value(), asks.first_key_value()) {
        if bid >= ask {
            return Err(BookError::CrossedBook {
                best_bid: bid.get(),
                best_ask: ask.get(),
            });
        }
    }
    Ok(())
}
