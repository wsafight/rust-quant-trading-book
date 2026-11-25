use quant_engine::domain::{ClientOrderId, PriceTicks, QtyLots, Side};
use quant_engine::ledger::{ApplyOutcome, Ledger};
use quant_engine::oms::{Order, OrderEvent, reduce};
use quant_engine::order_book::{Delta, OrderBook, Snapshot};
use quant_engine::replay::Replay;
use quant_engine::risk::{OrderIntent, RiskDecision, RiskSnapshot, check};
use quant_engine::simulator::{
    FillModel, MarketObservation, MarketTrade, SimOrderRequest, SimulatedVenue, SimulatorConfig,
    VenueReport,
};

fn price(value: i64) -> PriceTicks {
    PriceTicks::new(value).expect("demo prices are valid")
}

fn qty(value: i64) -> QtyLots {
    QtyLots::new(value).expect("demo quantities are valid")
}

fn apply_report(
    order: Order,
    ledger: &mut Ledger,
    report: &VenueReport,
) -> Result<Order, Box<dyn std::error::Error>> {
    if let VenueReport::Fill(fill) = report {
        ledger.apply_fill(fill.clone())?;
    }
    Ok(reduce(order, report.to_order_event())?)
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
    println!(
        "00:00 book Healthy(seq={:?}, bid={:?}, ask={:?})",
        book.last_sequence(),
        book.best_bid(),
        book.best_ask()
    );

    let intent = OrderIntent {
        side: Side::Buy,
        price: price(10_000),
        qty: qty(2),
    };
    let decision = check(
        intent,
        RiskSnapshot {
            enabled: true,
            book_fresh: true,
            book_tradable: book.is_tradable(),
            position_lots: 0,
            active_buy_lots: 0,
            uncertain_buy_lots: 0,
            active_sell_lots: 0,
            uncertain_sell_lots: 0,
            max_abs_position_lots: 5,
            max_order_lots: 2,
        },
    );
    assert_eq!(decision, RiskDecision::Allow);
    println!("00:01 quote -> hard risk {decision:?}");

    let config = SimulatorConfig {
        send_latency_ns: 5,
        new_ack_latency_ns: 20,
        cancel_latency_ns: 20,
        cancel_ack_latency_ns: 10,
        fill_report_latency_ns: 2,
        maker_fee_bps: 2,
        fill_model: FillModel::L2Queue,
    };
    let mut venue = SimulatedVenue::new(config, "SIM", "paper", "BTC-USD");
    let first_id = ClientOrderId::new("book-demo-1")?;
    venue.submit(
        SimOrderRequest {
            client_order_id: first_id.clone(),
            side: intent.side,
            price: intent.price,
            qty: intent.qty,
            queue_ahead_lots: 0,
        },
        1_000,
    )?;
    venue.on_market(MarketObservation {
        at_ns: 1_006,
        best_bid: price(10_000),
        best_ask: price(10_001),
        trade: Some(MarketTrade {
            aggressor: Side::Sell,
            price: price(10_000),
            qty: qty(2),
        }),
    })?;

    let mut ledger = Ledger::new(100_000);
    let mut first_order = Order::pending(first_id, intent.qty);
    let fill_report = venue.drain_reports(1_010).remove(0);
    let VenueReport::Fill(first_fill) = &fill_report.report else {
        unreachable!("the configured fill report precedes the new ack");
    };
    let first_fill = first_fill.clone();
    first_order = apply_report(first_order, &mut ledger, &fill_report.report)?;
    println!(
        "00:02 fill-before-ack -> OMS {:?}, position={}, equity={}",
        first_order.status(),
        ledger.snapshot().position_lots,
        ledger.equity_quote(price(10_000))?
    );

    let late_ack = venue.drain_reports(1_030).remove(0);
    first_order = apply_report(first_order, &mut ledger, &late_ack.report)?;
    assert_eq!(ledger.apply_fill(first_fill)?, ApplyOutcome::Duplicate);
    println!(
        "00:03 late new-ack + duplicate fill -> OMS {:?}, executions={}",
        first_order.status(),
        ledger.snapshot().execution_count
    );

    let gap = book
        .apply_delta(Delta {
            first_sequence: 103,
            last_sequence: 103,
            bids: vec![(price(9_998), 1)],
            asks: vec![],
        })
        .expect_err("the missing sequence must invalidate the book");
    let blocked = check(
        intent,
        RiskSnapshot {
            enabled: true,
            book_fresh: false,
            book_tradable: book.is_tradable(),
            position_lots: ledger.snapshot().position_lots,
            active_buy_lots: 0,
            uncertain_buy_lots: 0,
            active_sell_lots: 0,
            uncertain_sell_lots: 0,
            max_abs_position_lots: 5,
            max_order_lots: 2,
        },
    );
    println!("00:04 {gap} -> hard risk {blocked:?}");

    book.apply_snapshot(Snapshot {
        sequence: 200,
        bids: vec![(price(10_000), 5)],
        asks: vec![(price(10_002), 5)],
    })?;
    let cancel_id = ClientOrderId::new("book-demo-cancel")?;
    venue.submit(
        SimOrderRequest {
            client_order_id: cancel_id.clone(),
            side: Side::Sell,
            price: price(10_002),
            qty: qty(1),
            queue_ahead_lots: 2,
        },
        2_000,
    )?;
    let mut cancel_order = Order::pending(cancel_id.clone(), qty(1));
    let new_ack = venue.drain_reports(2_030).remove(0);
    cancel_order = apply_report(cancel_order, &mut ledger, &new_ack.report)?;
    cancel_order = reduce(cancel_order, OrderEvent::CancelRequested)?;
    venue.cancel(&cancel_id, 2_030)?;
    cancel_order = reduce(cancel_order, OrderEvent::Timeout)?;
    let before_reconciliation = venue.reconcile(&cancel_id, 2_040)?;
    println!(
        "00:05 cancel timeout -> OMS {:?}, venue {:?}",
        cancel_order.status(),
        before_reconciliation.status
    );

    let cancel_ack = venue.drain_reports(2_070).remove(0);
    cancel_order = apply_report(cancel_order, &mut ledger, &cancel_ack.report)?;
    let reconciled = venue.reconcile(&cancel_id, 2_070)?;
    println!(
        "00:06 reconciliation -> OMS {:?}, venue {:?}",
        cancel_order.status(),
        reconciled.status
    );

    let mut replay = Replay::default();
    for (at_ns, priority, sequence, event) in [
        (1_000, 1, 0, "submit"),
        (1_008, 0, 0, "fill"),
        (1_025, 1, 0, "new_ack"),
        (2_040, 0, 0, "cancel_timeout"),
        (2_060, 0, 0, "cancel_ack"),
    ] {
        replay.schedule(at_ns, priority, sequence, event)?;
    }
    let timeline: Vec<_> = std::iter::from_fn(|| replay.next_event())
        .map(|event| event.payload)
        .collect();
    assert!(ledger.verify_equity_identity(price(10_000))?);
    println!(
        "00:07 replay complete -> events={timeline:?}, ledger_checksum={:016x}, equity_closed=true",
        ledger.state_checksum()
    );
    Ok(())
}
