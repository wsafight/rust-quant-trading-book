use quant_engine::domain::{ClientOrderId, PriceTicks, QtyLots, Side};
use quant_engine::ledger::{ApplyOutcome, Ledger};
use quant_engine::oms::{Order, OrderStatus, reduce};
use quant_engine::simulator::{
    FillModel, MarketObservation, MarketTrade, SimOrderRequest, SimulatedVenue, SimulatorConfig,
    VenueReport,
};

fn price(value: i64) -> PriceTicks {
    PriceTicks::new(value).unwrap()
}

fn qty(value: i64) -> QtyLots {
    QtyLots::new(value).unwrap()
}

fn run_fill_before_ack() -> (OrderStatus, u64) {
    let config = SimulatorConfig {
        send_latency_ns: 5,
        new_ack_latency_ns: 20,
        cancel_latency_ns: 10,
        cancel_ack_latency_ns: 5,
        fill_report_latency_ns: 2,
        maker_fee_bps: 2,
        fill_model: FillModel::L2Queue,
    };
    let mut venue = SimulatedVenue::new(config, "SIM", "paper", "BTC-USD");
    let id = ClientOrderId::new("loop-order-1").unwrap();
    venue
        .submit(
            SimOrderRequest {
                client_order_id: id.clone(),
                side: Side::Buy,
                price: price(10_000),
                qty: qty(2),
                queue_ahead_lots: 0,
            },
            1_000,
        )
        .unwrap();
    venue
        .on_market(MarketObservation {
            at_ns: 1_006,
            best_bid: price(10_000),
            best_ask: price(10_001),
            trade: Some(MarketTrade {
                aggressor: Side::Sell,
                price: price(10_000),
                qty: qty(2),
            }),
        })
        .unwrap();

    let mut order = Order::pending(id, qty(2));
    let mut ledger = Ledger::new(100_000);
    let reports = venue.drain_reports(2_000);
    assert!(matches!(reports[0].report, VenueReport::Fill(_)));
    for timed in reports {
        if let VenueReport::Fill(fill) = &timed.report {
            assert_eq!(
                ledger.apply_fill(fill.clone()).unwrap(),
                ApplyOutcome::Applied
            );
            assert_eq!(
                ledger.apply_fill(fill.clone()).unwrap(),
                ApplyOutcome::Duplicate
            );
        }
        order = reduce(order, timed.report.to_order_event()).unwrap();
    }

    assert_eq!(ledger.snapshot().position_lots, 2);
    assert_eq!(ledger.snapshot().execution_count, 1);
    assert!(ledger.verify_equity_identity(price(10_000)).unwrap());
    (order.status(), ledger.state_checksum())
}

#[test]
fn simulator_oms_and_ledger_form_an_idempotent_loop() {
    let first = run_fill_before_ack();
    let second = run_fill_before_ack();
    assert_eq!(first.0, OrderStatus::Filled);
    assert_eq!(first, second);
}
