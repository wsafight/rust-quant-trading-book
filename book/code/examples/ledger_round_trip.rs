use quant_engine::domain::{ExecutionKey, PriceTicks, QtyLots, Side};
use quant_engine::ledger::{Fill, Ledger, Rational};

fn fill(id: &str, side: Side, price: i64, qty: i64, fee: i128) -> Fill {
    Fill {
        key: ExecutionKey::new("SIM", "paper", "BTC-USD", id),
        side,
        price: PriceTicks::new(price).unwrap(),
        qty: QtyLots::new(qty).unwrap(),
        fee_quote: fee,
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut ledger = Ledger::new(10_000);
    ledger.apply_fill(fill("buy-1", Side::Buy, 100, 2, 1))?;
    ledger.apply_fill(fill("buy-2", Side::Buy, 110, 3, 1))?;
    ledger.apply_fill(fill("sell-1", Side::Sell, 120, 2, 1))?;

    let snapshot = ledger.snapshot();
    assert_eq!(snapshot.position_lots, 3);
    assert_eq!(snapshot.open_cost_quote, Rational::from_integer(318));
    assert_eq!(
        snapshot.realized_price_pnl_quote,
        Rational::from_integer(28)
    );
    assert!(ledger.verify_equity_identity(PriceTicks::new(115)?)?);
    Ok(())
}
