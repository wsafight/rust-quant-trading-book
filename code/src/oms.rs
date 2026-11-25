use std::collections::HashMap;
use std::fmt;

use crate::domain::{ClientOrderId, ExecutionKey, QtyLots};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrderStatus {
    PendingNew,
    Open,
    PartiallyFilled,
    PendingCancel,
    Filled,
    Cancelled,
    Rejected,
    Uncertain,
}

impl OrderStatus {
    pub const fn is_terminal(self) -> bool {
        matches!(self, Self::Filled | Self::Cancelled | Self::Rejected)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Order {
    client_order_id: ClientOrderId,
    total_qty: QtyLots,
    filled_qty: i64,
    status: OrderStatus,
    executions: HashMap<ExecutionKey, QtyLots>,
}

impl Order {
    pub fn pending(client_order_id: ClientOrderId, total_qty: QtyLots) -> Self {
        Self {
            client_order_id,
            total_qty,
            filled_qty: 0,
            status: OrderStatus::PendingNew,
            executions: HashMap::new(),
        }
    }

    pub fn has_execution(&self, key: &ExecutionKey) -> bool {
        self.executions.contains_key(key)
    }

    pub fn client_order_id(&self) -> &ClientOrderId {
        &self.client_order_id
    }

    pub const fn total_qty(&self) -> QtyLots {
        self.total_qty
    }

    pub const fn filled_qty(&self) -> i64 {
        self.filled_qty
    }

    pub const fn status(&self) -> OrderStatus {
        self.status
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OrderEvent {
    NewAck,
    Reject,
    CancelRequested,
    CancelAck,
    Fill { key: ExecutionKey, qty: QtyLots },
    Timeout,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReduceError {
    IllegalTransition,
    ConflictingExecution { previous: i64, received: i64 },
    Overfill { total: i64, attempted: i128 },
}

impl fmt::Display for ReduceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::IllegalTransition => f.write_str("illegal order state transition"),
            Self::ConflictingExecution { previous, received } => write!(
                f,
                "execution key was reused with a different quantity: previous {previous}, received {received}"
            ),
            Self::Overfill { total, attempted } => {
                write!(
                    f,
                    "fill exceeds order quantity: total {total}, attempted {attempted}"
                )
            }
        }
    }
}

impl std::error::Error for ReduceError {}

pub fn reduce(mut order: Order, event: OrderEvent) -> Result<Order, ReduceError> {
    match event {
        OrderEvent::Fill { key, qty } => {
            if let Some(previous) = order.executions.get(&key) {
                return if *previous == qty {
                    Ok(order)
                } else {
                    Err(ReduceError::ConflictingExecution {
                        previous: previous.get(),
                        received: qty.get(),
                    })
                };
            }
            if order.status == OrderStatus::Rejected {
                return Err(ReduceError::IllegalTransition);
            }
            let previous_status = order.status;
            let attempted = i128::from(order.filled_qty) + i128::from(qty.get());
            if attempted > i128::from(order.total_qty.get()) {
                return Err(ReduceError::Overfill {
                    total: order.total_qty.get(),
                    attempted,
                });
            }
            order.executions.insert(key, qty);
            order.filled_qty = attempted as i64;
            order.status = if attempted == i128::from(order.total_qty.get()) {
                OrderStatus::Filled
            } else if previous_status == OrderStatus::Cancelled {
                // Cancel ack and execution reports can arrive out of order.
                OrderStatus::Cancelled
            } else if previous_status == OrderStatus::PendingCancel {
                OrderStatus::PendingCancel
            } else {
                OrderStatus::PartiallyFilled
            };
        }
        OrderEvent::NewAck
            if matches!(
                order.status,
                OrderStatus::PendingNew | OrderStatus::Uncertain
            ) =>
        {
            order.status = if order.filled_qty == 0 {
                OrderStatus::Open
            } else {
                OrderStatus::PartiallyFilled
            };
        }
        OrderEvent::NewAck
            if matches!(
                order.status,
                OrderStatus::PartiallyFilled | OrderStatus::Filled | OrderStatus::Cancelled
            ) => {}
        OrderEvent::Reject
            if matches!(
                order.status,
                OrderStatus::PendingNew | OrderStatus::Uncertain
            ) && order.filled_qty == 0 =>
        {
            order.status = OrderStatus::Rejected;
        }
        OrderEvent::CancelRequested
            if matches!(
                order.status,
                OrderStatus::Open | OrderStatus::PartiallyFilled
            ) =>
        {
            order.status = OrderStatus::PendingCancel;
        }
        OrderEvent::CancelAck
            if matches!(
                order.status,
                OrderStatus::PendingNew
                    | OrderStatus::Open
                    | OrderStatus::PartiallyFilled
                    | OrderStatus::PendingCancel
                    | OrderStatus::Uncertain
            ) =>
        {
            order.status = OrderStatus::Cancelled;
        }
        OrderEvent::CancelAck
            if matches!(order.status, OrderStatus::Filled | OrderStatus::Cancelled) => {}
        OrderEvent::Timeout if !order.status.is_terminal() => {
            order.status = OrderStatus::Uncertain;
        }
        OrderEvent::Timeout if order.status.is_terminal() => {}
        _ => return Err(ReduceError::IllegalTransition),
    }
    Ok(order)
}
