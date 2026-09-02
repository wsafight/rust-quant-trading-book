use quant_engine::order_book::OrderBook;
use quant_engine::venue_fixture::{DecimalScale, decode_delta, decode_snapshot};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let scale = DecimalScale {
        price_decimals: 2,
        qty_decimals: 2,
    };
    let mut book = OrderBook::default();
    book.apply_snapshot(decode_snapshot(
        include_str!("../fixtures/binance-spot-btcusdt-snapshot.json"),
        scale,
    )?)?;

    for line in include_str!("../fixtures/binance-spot-btcusdt-deltas.jsonl").lines() {
        let event = decode_delta(line, scale)?;
        assert_eq!(event.symbol, "BTCUSDT");
        book.apply_delta(event.delta)?;
    }

    assert_eq!(book.last_sequence(), Some(103));
    assert!(book.is_tradable());
    Ok(())
}
