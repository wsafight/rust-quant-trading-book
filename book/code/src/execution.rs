use std::collections::BTreeMap;
use std::fmt;

use crate::domain::{ClientOrderId, QtyLots, Side};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChildState {
    Working,
    PendingCancel,
    Filled,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChildOrder {
    pub client_order_id: ClientOrderId,
    pub original_lots: i64,
    pub filled_lots: i64,
    pub state: ChildState,
}

impl ChildOrder {
    pub fn remaining_lots(&self) -> i64 {
        self.original_lots - self.filled_lots
    }

    fn potential_fill_lots(&self) -> i64 {
        match self.state {
            ChildState::Working | ChildState::PendingCancel => self.remaining_lots(),
            ChildState::Filled | ChildState::Cancelled => 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExecutionError {
    DuplicateChild(ClientOrderId),
    UnknownChild(ClientOrderId),
    ChildNotActive(ClientOrderId),
    ChildExceedsRemaining { requested: i64, available: i64 },
    ChildOverfill { original: i64, attempted: i128 },
    ParentOverfill { target: i64, attempted: i128 },
}

impl fmt::Display for ExecutionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DuplicateChild(id) => write!(f, "duplicate child order: {}", id.as_str()),
            Self::UnknownChild(id) => write!(f, "unknown child order: {}", id.as_str()),
            Self::ChildNotActive(id) => {
                write!(f, "child order is not active: {}", id.as_str())
            }
            Self::ChildExceedsRemaining {
                requested,
                available,
            } => write!(
                f,
                "child quantity exceeds parent capacity: requested={requested}, available={available}"
            ),
            Self::ChildOverfill {
                original,
                attempted,
            } => write!(
                f,
                "child fill exceeds order quantity: original={original}, attempted={attempted}"
            ),
            Self::ParentOverfill { target, attempted } => write!(
                f,
                "confirmed fills exceed parent target: target={target}, attempted={attempted}"
            ),
        }
    }
}

impl std::error::Error for ExecutionError {}

#[derive(Debug, Clone)]
pub struct ParentExecution {
    pub side: Side,
    target_lots: i64,
    confirmed_filled_lots: i64,
    children: BTreeMap<ClientOrderId, ChildOrder>,
}

impl ParentExecution {
    pub fn new(side: Side, target: QtyLots) -> Self {
        Self {
            side,
            target_lots: target.get(),
            confirmed_filled_lots: 0,
            children: BTreeMap::new(),
        }
    }

    pub const fn target_lots(&self) -> i64 {
        self.target_lots
    }

    pub const fn confirmed_filled_lots(&self) -> i64 {
        self.confirmed_filled_lots
    }

    pub fn open_risk_lots(&self) -> i64 {
        let total = self.children.values().fold(0_i128, |acc, child| {
            acc + i128::from(child.potential_fill_lots())
        });
        total.min(i128::from(i64::MAX)) as i64
    }

    pub fn new_child_capacity_lots(&self) -> i64 {
        let available = i128::from(self.target_lots)
            - i128::from(self.confirmed_filled_lots)
            - i128::from(self.open_risk_lots());
        available.clamp(0, i128::from(i64::MAX)) as i64
    }

    pub fn register_child(
        &mut self,
        client_order_id: ClientOrderId,
        qty: QtyLots,
    ) -> Result<(), ExecutionError> {
        if self.children.contains_key(&client_order_id) {
            return Err(ExecutionError::DuplicateChild(client_order_id));
        }
        let available = self.new_child_capacity_lots();
        if qty.get() > available {
            return Err(ExecutionError::ChildExceedsRemaining {
                requested: qty.get(),
                available,
            });
        }
        self.children.insert(
            client_order_id.clone(),
            ChildOrder {
                client_order_id,
                original_lots: qty.get(),
                filled_lots: 0,
                state: ChildState::Working,
            },
        );
        Ok(())
    }

    pub fn apply_confirmed_fill(
        &mut self,
        client_order_id: &ClientOrderId,
        qty: QtyLots,
    ) -> Result<(), ExecutionError> {
        let child = self
            .children
            .get_mut(client_order_id)
            .ok_or_else(|| ExecutionError::UnknownChild(client_order_id.clone()))?;
        if matches!(child.state, ChildState::Filled | ChildState::Cancelled) {
            return Err(ExecutionError::ChildNotActive(client_order_id.clone()));
        }
        let child_attempted = i128::from(child.filled_lots) + i128::from(qty.get());
        if child_attempted > i128::from(child.original_lots) {
            return Err(ExecutionError::ChildOverfill {
                original: child.original_lots,
                attempted: child_attempted,
            });
        }
        let parent_attempted = i128::from(self.confirmed_filled_lots) + i128::from(qty.get());
        if parent_attempted > i128::from(self.target_lots) {
            return Err(ExecutionError::ParentOverfill {
                target: self.target_lots,
                attempted: parent_attempted,
            });
        }
        child.filled_lots = child_attempted as i64;
        if child.filled_lots == child.original_lots {
            child.state = ChildState::Filled;
        }
        self.confirmed_filled_lots = parent_attempted as i64;
        Ok(())
    }

    pub fn request_cancel(
        &mut self,
        client_order_id: &ClientOrderId,
    ) -> Result<(), ExecutionError> {
        let child = self
            .children
            .get_mut(client_order_id)
            .ok_or_else(|| ExecutionError::UnknownChild(client_order_id.clone()))?;
        if child.state != ChildState::Working {
            return Err(ExecutionError::ChildNotActive(client_order_id.clone()));
        }
        child.state = ChildState::PendingCancel;
        Ok(())
    }

    /// Applies an authoritative cancel result after the OMS has incorporated
    /// the venue's final cumulative fill quantity.
    pub fn confirm_cancel(
        &mut self,
        client_order_id: &ClientOrderId,
    ) -> Result<(), ExecutionError> {
        let child = self
            .children
            .get_mut(client_order_id)
            .ok_or_else(|| ExecutionError::UnknownChild(client_order_id.clone()))?;
        if child.state != ChildState::PendingCancel {
            return Err(ExecutionError::ChildNotActive(client_order_id.clone()));
        }
        child.state = ChildState::Cancelled;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn qty(value: i64) -> QtyLots {
        QtyLots::new(value).unwrap()
    }

    #[test]
    fn pending_cancel_still_consumes_parent_capacity() {
        let mut parent = ParentExecution::new(Side::Buy, qty(10));
        let maker = ClientOrderId::new("maker-1").unwrap();
        parent.register_child(maker.clone(), qty(4)).unwrap();
        parent.apply_confirmed_fill(&maker, qty(1)).unwrap();
        parent.request_cancel(&maker).unwrap();

        assert_eq!(parent.confirmed_filled_lots(), 1);
        assert_eq!(parent.open_risk_lots(), 3);
        assert_eq!(parent.new_child_capacity_lots(), 6);
        assert_eq!(
            parent.register_child(ClientOrderId::new("taker-too-large").unwrap(), qty(9)),
            Err(ExecutionError::ChildExceedsRemaining {
                requested: 9,
                available: 6,
            })
        );

        parent.confirm_cancel(&maker).unwrap();
        assert_eq!(parent.open_risk_lots(), 0);
        assert_eq!(parent.new_child_capacity_lots(), 9);
    }
}
