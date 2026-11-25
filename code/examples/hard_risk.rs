use quant_engine::domain::{PriceTicks, QtyLots, Side};
use quant_engine::risk::{OrderIntent, RiskDecision, RiskSnapshot, check};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let decision = check(
        OrderIntent {
            side: Side::Buy,
            price: PriceTicks::new(100)?,
            qty: QtyLots::new(5)?,
        },
        RiskSnapshot {
            enabled: true,
            book_fresh: true,
            book_tradable: true,
            position_lots: 6,
            active_buy_lots: 2,
            uncertain_buy_lots: 1,
            active_sell_lots: 0,
            uncertain_sell_lots: 0,
            max_abs_position_lots: 10,
            max_order_lots: 5,
        },
    );
    assert_eq!(decision, RiskDecision::Resize { max_qty_lots: 1 });
    Ok(())
}
