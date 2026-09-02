use quant_engine::domain::{ClientOrderId, QtyLots, Side};
use quant_engine::execution::ParentExecution;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut parent = ParentExecution::new(Side::Buy, QtyLots::new(10)?);
    let maker = ClientOrderId::new("maker-1")?;
    parent.register_child(maker.clone(), QtyLots::new(4)?)?;
    parent.apply_confirmed_fill(&maker, QtyLots::new(1)?)?;
    parent.request_cancel(&maker)?;

    // The remaining maker quantity can still fill while cancel is in flight.
    assert_eq!(parent.confirmed_filled_lots(), 1);
    assert_eq!(parent.open_risk_lots(), 3);
    assert_eq!(parent.new_child_capacity_lots(), 6);

    parent.register_child(ClientOrderId::new("taker-1")?, QtyLots::new(6)?)?;
    assert_eq!(parent.new_child_capacity_lots(), 0);
    Ok(())
}
