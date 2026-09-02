use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DomainError {
    NonPositivePrice,
    NonPositiveQuantity,
    EmptyClientOrderId,
}

impl fmt::Display for DomainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NonPositivePrice => f.write_str("price ticks must be positive"),
            Self::NonPositiveQuantity => f.write_str("quantity lots must be positive"),
            Self::EmptyClientOrderId => {
                f.write_str("client order id cannot be empty or whitespace-only")
            }
        }
    }
}

impl std::error::Error for DomainError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PriceTicks(i64);

impl PriceTicks {
    pub fn new(value: i64) -> Result<Self, DomainError> {
        (value > 0)
            .then_some(Self(value))
            .ok_or(DomainError::NonPositivePrice)
    }

    pub const fn get(self) -> i64 {
        self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct QtyLots(i64);

impl QtyLots {
    pub fn new(value: i64) -> Result<Self, DomainError> {
        (value > 0)
            .then_some(Self(value))
            .ok_or(DomainError::NonPositiveQuantity)
    }

    pub const fn get(self) -> i64 {
        self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Side {
    Buy,
    Sell,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ClientOrderId(String);

impl ClientOrderId {
    pub fn new(value: impl Into<String>) -> Result<Self, DomainError> {
        let value = value.into();
        (!value.trim().is_empty())
            .then_some(Self(value))
            .ok_or(DomainError::EmptyClientOrderId)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ExecutionKey {
    pub venue: String,
    pub account: String,
    pub instrument: String,
    pub execution_id: String,
}

impl ExecutionKey {
    pub fn new(venue: &str, account: &str, instrument: &str, execution_id: &str) -> Self {
        Self {
            venue: venue.into(),
            account: account.into(),
            instrument: instrument.into(),
            execution_id: execution_id.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_units() {
        assert_eq!(PriceTicks::new(0), Err(DomainError::NonPositivePrice));
        assert_eq!(QtyLots::new(-1), Err(DomainError::NonPositiveQuantity));
    }

    #[test]
    fn rejects_empty_client_order_ids() {
        assert_eq!(
            ClientOrderId::new("  \t"),
            Err(DomainError::EmptyClientOrderId)
        );
    }
}
