use quant_engine::domain::{ClientOrderId, ExecutionKey, PriceTicks, QtyLots, Side};
use quant_engine::oms::{Order, OrderEvent, OrderStatus, ReduceError, reduce};
use quant_engine::order_book::{BookError, Delta, OrderBook, Snapshot};
use quant_engine::risk::{OrderIntent, RiskDecision, RiskRejectReason, RiskSnapshot, check};

fn price(value: i64) -> PriceTicks {
    PriceTicks::new(value).unwrap()
}

fn qty(value: i64) -> QtyLots {
    QtyLots::new(value).unwrap()
}

fn client_order_id(value: &str) -> ClientOrderId {
    ClientOrderId::new(value).unwrap()
}

fn order() -> Order {
    Order::pending(client_order_id("test-order-1"), qty(10))
}

fn execution(id: &str) -> ExecutionKey {
    ExecutionKey::new("SIM", "paper", "BTC-USD", id)
}

#[test]
fn sequence_gap_invalidates_book_until_snapshot() {
    let mut book = OrderBook::default();
    book.apply_snapshot(Snapshot {
        sequence: 10,
        bids: vec![(price(99), 2)],
        asks: vec![(price(101), 3)],
    })
    .unwrap();

    let error = book
        .apply_delta(Delta {
            first_sequence: 12,
            last_sequence: 12,
            bids: vec![(price(100), 1)],
            asks: vec![],
        })
        .unwrap_err();
    assert_eq!(
        error,
        BookError::SequenceGap {
            expected: 11,
            received: 12
        }
    );
    assert!(!book.is_valid());
    assert_eq!(book.best_bid(), None);
    assert_eq!(
        book.apply_delta(Delta {
            first_sequence: 11,
            last_sequence: 11,
            bids: vec![],
            asks: vec![],
        }),
        Err(BookError::NeedsSnapshot)
    );
}

#[test]
fn invalid_snapshot_revokes_an_existing_books_validity() {
    let mut book = OrderBook::default();
    book.apply_snapshot(Snapshot {
        sequence: 10,
        bids: vec![(price(99), 2)],
        asks: vec![(price(101), 3)],
    })
    .unwrap();

    let error = book
        .apply_snapshot(Snapshot {
            sequence: 20,
            bids: vec![(price(102), 2)],
            asks: vec![(price(101), 3)],
        })
        .unwrap_err();
    assert_eq!(
        error,
        BookError::CrossedBook {
            best_bid: 102,
            best_ask: 101
        }
    );
    assert!(!book.is_valid());
    assert_eq!(book.best_bid(), None);
}

#[test]
fn structural_validity_does_not_imply_tradability() {
    let mut book = OrderBook::default();
    book.apply_snapshot(Snapshot {
        sequence: 10,
        bids: vec![(price(99), 2)],
        asks: vec![],
    })
    .unwrap();

    assert!(book.is_structurally_valid());
    assert!(!book.is_tradable());
}

#[test]
fn fill_before_ack_is_absorbed_without_state_regression() {
    let order = reduce(
        order(),
        OrderEvent::Fill {
            key: execution("fill-1"),
            qty: qty(10),
        },
    )
    .unwrap();
    assert_eq!(order.status(), OrderStatus::Filled);

    let order = reduce(order, OrderEvent::NewAck).unwrap();
    assert_eq!(order.status(), OrderStatus::Filled);
    assert_eq!(order.filled_qty(), 10);
}

#[test]
fn duplicate_fill_changes_accounting_once() {
    let key = execution("fill-1");
    let order = reduce(
        order(),
        OrderEvent::Fill {
            key: key.clone(),
            qty: qty(4),
        },
    )
    .unwrap();
    let order = reduce(order, OrderEvent::Fill { key, qty: qty(4) }).unwrap();

    assert_eq!(order.filled_qty(), 4);
    assert_eq!(order.status(), OrderStatus::PartiallyFilled);
}

#[test]
fn extreme_fill_quantity_cannot_hide_an_overfill() {
    let order = Order::pending(client_order_id("large-order"), qty(i64::MAX));
    let order = reduce(
        order,
        OrderEvent::Fill {
            key: execution("large-fill-1"),
            qty: qty(i64::MAX - 1),
        },
    )
    .unwrap();

    assert_eq!(
        reduce(
            order,
            OrderEvent::Fill {
                key: execution("large-fill-2"),
                qty: qty(2),
            },
        ),
        Err(ReduceError::Overfill {
            total: i64::MAX,
            attempted: i128::from(i64::MAX) + 1,
        })
    );
}

#[test]
fn timeout_marks_nonterminal_order_uncertain() {
    let order = reduce(order(), OrderEvent::Timeout).unwrap();
    assert_eq!(order.status(), OrderStatus::Uncertain);
}

#[test]
fn late_ack_resolves_an_uncertain_order() {
    let order = reduce(order(), OrderEvent::Timeout).unwrap();
    let order = reduce(order, OrderEvent::NewAck).unwrap();
    assert_eq!(order.status(), OrderStatus::Open);
}

#[test]
fn explicit_reject_resolves_an_unfilled_uncertain_order() {
    let order = reduce(order(), OrderEvent::Timeout).unwrap();
    let order = reduce(order, OrderEvent::Reject).unwrap();
    assert_eq!(order.status(), OrderStatus::Rejected);
}

#[test]
fn late_cancel_ack_does_not_regress_a_filled_order() {
    let order = reduce(order(), OrderEvent::NewAck).unwrap();
    let order = reduce(order, OrderEvent::CancelRequested).unwrap();
    let order = reduce(
        order,
        OrderEvent::Fill {
            key: execution("fill-final"),
            qty: qty(10),
        },
    )
    .unwrap();
    let order = reduce(order, OrderEvent::CancelAck).unwrap();
    assert_eq!(order.status(), OrderStatus::Filled);
    assert_eq!(order.filled_qty(), 10);
}

#[test]
fn pending_cancel_partial_fill_keeps_pending_cancel() {
    let order = reduce(order(), OrderEvent::NewAck).unwrap();
    let order = reduce(order, OrderEvent::CancelRequested).unwrap();
    let order = reduce(
        order,
        OrderEvent::Fill {
            key: execution("fill-partial"),
            qty: qty(4),
        },
    )
    .unwrap();
    assert_eq!(order.status(), OrderStatus::PendingCancel);
    assert_eq!(order.filled_qty(), 4);

    let order = reduce(order, OrderEvent::CancelAck).unwrap();
    assert_eq!(order.status(), OrderStatus::Cancelled);
    assert_eq!(order.filled_qty(), 4);
}

#[test]
fn fill_reported_after_cancel_ack_is_still_accounted() {
    let order = reduce(order(), OrderEvent::NewAck).unwrap();
    let order = reduce(order, OrderEvent::CancelRequested).unwrap();
    let order = reduce(order, OrderEvent::CancelAck).unwrap();
    let order = reduce(
        order,
        OrderEvent::Fill {
            key: execution("late-fill"),
            qty: qty(4),
        },
    )
    .unwrap();
    assert_eq!(order.status(), OrderStatus::Cancelled);
    assert_eq!(order.filled_qty(), 4);
}

#[test]
fn cancelled_late_fill_that_completes_order_becomes_filled() {
    let order = reduce(order(), OrderEvent::NewAck).unwrap();
    let order = reduce(order, OrderEvent::CancelRequested).unwrap();
    let order = reduce(order, OrderEvent::CancelAck).unwrap();
    let order = reduce(
        order,
        OrderEvent::Fill {
            key: execution("late-final-fill"),
            qty: qty(10),
        },
    )
    .unwrap();

    assert_eq!(order.status(), OrderStatus::Filled);
    assert_eq!(order.filled_qty(), 10);
}

#[test]
fn risk_counts_active_and_uncertain_orders_in_worst_case() {
    let decision = check(
        OrderIntent {
            side: Side::Buy,
            price: price(100),
            qty: qty(5),
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
}

#[test]
fn stale_market_data_blocks_orders() {
    let decision = check(
        OrderIntent {
            side: Side::Sell,
            price: price(100),
            qty: qty(1),
        },
        RiskSnapshot {
            enabled: true,
            book_fresh: false,
            book_tradable: false,
            position_lots: 0,
            active_buy_lots: 0,
            uncertain_buy_lots: 0,
            active_sell_lots: 0,
            uncertain_sell_lots: 0,
            max_abs_position_lots: 10,
            max_order_lots: 5,
        },
    );
    assert_eq!(
        decision,
        RiskDecision::Reject(RiskRejectReason::StaleMarketData)
    );
    assert_eq!(
        RiskRejectReason::StaleMarketData.as_str(),
        "stale_market_data"
    );
    assert_eq!(
        RiskRejectReason::StaleMarketData.to_string(),
        "stale_market_data"
    );
}

#[test]
fn invalid_open_exposure_fails_closed() {
    let decision = check(
        OrderIntent {
            side: Side::Buy,
            price: price(100),
            qty: qty(1),
        },
        RiskSnapshot {
            enabled: true,
            book_fresh: true,
            book_tradable: true,
            position_lots: 0,
            active_buy_lots: -1,
            uncertain_buy_lots: 0,
            active_sell_lots: 0,
            uncertain_sell_lots: 0,
            max_abs_position_lots: 10,
            max_order_lots: 5,
        },
    );
    assert_eq!(
        decision,
        RiskDecision::Reject(RiskRejectReason::InvalidExposure)
    );
}

#[test]
fn untradable_book_blocks_increasing_risk() {
    let decision = check(
        OrderIntent {
            side: Side::Buy,
            price: price(100),
            qty: qty(1),
        },
        RiskSnapshot {
            enabled: true,
            book_fresh: true,
            book_tradable: false,
            position_lots: 0,
            active_buy_lots: 0,
            uncertain_buy_lots: 0,
            active_sell_lots: 0,
            uncertain_sell_lots: 0,
            max_abs_position_lots: 10,
            max_order_lots: 5,
        },
    );
    assert_eq!(
        decision,
        RiskDecision::Reject(RiskRejectReason::UntradableBook)
    );
}
