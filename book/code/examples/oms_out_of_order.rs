use quant_engine::domain::{ClientOrderId, ExecutionKey, QtyLots};
use quant_engine::oms::{Order, OrderEvent, OrderStatus, reduce};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let order = Order::pending(ClientOrderId::new("example-1"), QtyLots::new(10)?);
    let order = reduce(
        order,
        OrderEvent::Fill {
            key: ExecutionKey::new("SIM", "paper", "BTC-USD", "fill-7"),
            qty: QtyLots::new(10)?,
        },
    )?;
    let order = reduce(order, OrderEvent::NewAck)?;

    assert_eq!(order.status, OrderStatus::Filled);
    assert_eq!(order.filled_qty, 10);
    Ok(())
}
