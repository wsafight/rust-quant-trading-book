use quant_engine::domain::{ClientOrderId, ExecutionKey, PriceTicks, QtyLots, Side};
use quant_engine::oms::{Order, OrderEvent, reduce};
use quant_engine::order_book::{Delta, OrderBook, Snapshot};
use quant_engine::replay::Replay;
use quant_engine::risk::{OrderIntent, RiskDecision, RiskSnapshot, check};

fn price(value: i64) -> PriceTicks {
    PriceTicks::new(value).expect("demo prices are valid")
}

fn qty(value: i64) -> QtyLots {
    QtyLots::new(value).expect("demo quantities are valid")
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut book = OrderBook::default();
    book.apply_snapshot(Snapshot {
        sequence: 100,
        bids: vec![(price(9_999), 5)],
        asks: vec![(price(10_001), 4)],
    })?;
    book.apply_delta(Delta {
        first_sequence: 101,
        last_sequence: 101,
        bids: vec![(price(10_000), 3)],
        asks: vec![],
    })?;
    let book_tradable = book.is_tradable();
    // This demo applies a local event immediately; production derives freshness
    // from receive/process timestamps and a configured age limit.
    let book_fresh = true;
    assert!(book_tradable);

    let intent = OrderIntent {
        side: Side::Buy,
        price: price(10_000),
        qty: qty(2),
    };
    let decision = check(
        intent,
        RiskSnapshot {
            enabled: true,
            book_fresh,
            book_tradable,
            position_lots: 1,
            active_buy_lots: 0,
            uncertain_buy_lots: 0,
            active_sell_lots: 0,
            uncertain_sell_lots: 0,
            max_abs_position_lots: 5,
            max_order_lots: 2,
        },
    );
    assert_eq!(decision, RiskDecision::Allow);

    let order = Order::pending(ClientOrderId::new("book-demo-1"), intent.qty);
    let order = reduce(order, OrderEvent::NewAck)?;
    let order = reduce(
        order,
        OrderEvent::Fill {
            key: ExecutionKey::new("SIM", "paper", "BTC-USD", "fill-1"),
            qty: intent.qty,
        },
    )?;

    let mut replay = Replay::default();
    replay.schedule(1_000, 1, 0, "market_delta")?;
    replay.schedule(1_005, 1, 1, "order_ack")?;
    replay.schedule(1_010, 1, 2, "fill")?;
    let timeline: Vec<_> = std::iter::from_fn(|| replay.next_event())
        .map(|event| (event.at_ns, event.payload))
        .collect();

    println!(
        "book={:?}/{:?} order={:?} timeline={timeline:?}",
        book.best_bid(),
        book.best_ask(),
        order.status
    );
    Ok(())
}
