use std::collections::BTreeMap;
use std::fmt;

use crate::domain::{ClientOrderId, ExecutionKey, PriceTicks, QtyLots, Side};
use crate::ledger::Fill;
use crate::oms::OrderEvent;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FillModel {
    Touch,
    TradeThrough,
    L2Queue,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SimulatorConfig {
    pub send_latency_ns: u64,
    pub new_ack_latency_ns: u64,
    pub cancel_latency_ns: u64,
    pub cancel_ack_latency_ns: u64,
    pub fill_report_latency_ns: u64,
    pub maker_fee_bps: u32,
    pub fill_model: FillModel,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SimOrderRequest {
    pub client_order_id: ClientOrderId,
    pub side: Side,
    pub price: PriceTicks,
    pub qty: QtyLots,
    pub queue_ahead_lots: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MarketTrade {
    pub aggressor: Side,
    pub price: PriceTicks,
    pub qty: QtyLots,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MarketObservation {
    pub at_ns: u64,
    pub best_bid: PriceTicks,
    pub best_ask: PriceTicks,
    pub trade: Option<MarketTrade>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VenueReport {
    NewAck,
    Fill(Fill),
    CancelAck,
}

impl VenueReport {
    pub fn to_order_event(&self) -> OrderEvent {
        match self {
            Self::NewAck => OrderEvent::NewAck,
            Self::Fill(fill) => OrderEvent::Fill {
                key: fill.key.clone(),
                qty: fill.qty,
            },
            Self::CancelAck => OrderEvent::CancelAck,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimedVenueReport {
    pub at_ns: u64,
    pub client_order_id: ClientOrderId,
    pub report: VenueReport,
    sequence: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VenueOrderStatus {
    PendingArrival,
    Working,
    PendingCancel,
    Filled,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VenueOrderTruth {
    pub status: VenueOrderStatus,
    pub filled_lots: i64,
    pub remaining_lots: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SimulatorError {
    DuplicateClientOrderId(ClientOrderId),
    UnknownOrder(ClientOrderId),
    InvalidQueueAhead(i64),
    InvalidMarketTime { previous_ns: u64, received_ns: u64 },
    CrossedMarket { best_bid: i64, best_ask: i64 },
    OrderAlreadyTerminal(ClientOrderId),
    ArithmeticOverflow,
}

impl fmt::Display for SimulatorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DuplicateClientOrderId(id) => {
                write!(f, "duplicate client order id: {}", id.as_str())
            }
            Self::UnknownOrder(id) => write!(f, "unknown order: {}", id.as_str()),
            Self::InvalidQueueAhead(qty) => write!(f, "queue ahead cannot be negative: {qty}"),
            Self::InvalidMarketTime {
                previous_ns,
                received_ns,
            } => write!(
                f,
                "market time moved backwards: previous={previous_ns}, received={received_ns}"
            ),
            Self::CrossedMarket { best_bid, best_ask } => {
                write!(
                    f,
                    "crossed market: best bid {best_bid}, best ask {best_ask}"
                )
            }
            Self::OrderAlreadyTerminal(id) => {
                write!(f, "order is already terminal: {}", id.as_str())
            }
            Self::ArithmeticOverflow => f.write_str("simulator arithmetic overflow"),
        }
    }
}

impl std::error::Error for SimulatorError {}

#[derive(Debug, Clone)]
struct WorkingOrder {
    request: SimOrderRequest,
    accepted_at_ns: u64,
    remaining_lots: i64,
    cancel_effective_at_ns: Option<u64>,
}

#[derive(Debug)]
pub struct SimulatedVenue {
    config: SimulatorConfig,
    venue: String,
    account: String,
    instrument: String,
    orders: BTreeMap<ClientOrderId, WorkingOrder>,
    reports: Vec<TimedVenueReport>,
    next_sequence: u64,
    next_execution: u64,
    last_market_ns: u64,
}

impl SimulatedVenue {
    pub fn new(config: SimulatorConfig, venue: &str, account: &str, instrument: &str) -> Self {
        Self {
            config,
            venue: venue.into(),
            account: account.into(),
            instrument: instrument.into(),
            orders: BTreeMap::new(),
            reports: Vec::new(),
            next_sequence: 0,
            next_execution: 0,
            last_market_ns: 0,
        }
    }

    pub fn submit(&mut self, request: SimOrderRequest, now_ns: u64) -> Result<(), SimulatorError> {
        if request.queue_ahead_lots < 0 {
            return Err(SimulatorError::InvalidQueueAhead(request.queue_ahead_lots));
        }
        if self.orders.contains_key(&request.client_order_id) {
            return Err(SimulatorError::DuplicateClientOrderId(
                request.client_order_id,
            ));
        }
        let accepted_at_ns = now_ns
            .checked_add(self.config.send_latency_ns)
            .ok_or(SimulatorError::ArithmeticOverflow)?;
        let ack_at_ns = accepted_at_ns
            .checked_add(self.config.new_ack_latency_ns)
            .ok_or(SimulatorError::ArithmeticOverflow)?;
        let sequence = self.reserve_report_sequence()?;
        let client_order_id = request.client_order_id.clone();
        self.orders.insert(
            client_order_id.clone(),
            WorkingOrder {
                remaining_lots: request.qty.get(),
                request,
                accepted_at_ns,
                cancel_effective_at_ns: None,
            },
        );
        self.push_report(sequence, ack_at_ns, client_order_id, VenueReport::NewAck);
        Ok(())
    }

    pub fn cancel(
        &mut self,
        client_order_id: &ClientOrderId,
        now_ns: u64,
    ) -> Result<(), SimulatorError> {
        let accepted_at_ns = {
            let order = self
                .orders
                .get(client_order_id)
                .ok_or_else(|| SimulatorError::UnknownOrder(client_order_id.clone()))?;
            if order.remaining_lots == 0
                || order
                    .cancel_effective_at_ns
                    .is_some_and(|effective| effective <= now_ns)
            {
                return Err(SimulatorError::OrderAlreadyTerminal(
                    client_order_id.clone(),
                ));
            }
            if order.cancel_effective_at_ns.is_some() {
                return Ok(());
            }
            order.accepted_at_ns
        };
        let effective_at_ns = now_ns
            .max(accepted_at_ns)
            .checked_add(self.config.cancel_latency_ns)
            .ok_or(SimulatorError::ArithmeticOverflow)?;
        let report_at_ns = effective_at_ns
            .checked_add(self.config.cancel_ack_latency_ns)
            .ok_or(SimulatorError::ArithmeticOverflow)?;
        let sequence = self.reserve_report_sequence()?;
        self.orders
            .get_mut(client_order_id)
            .expect("order was validated above")
            .cancel_effective_at_ns = Some(effective_at_ns);
        self.push_report(
            sequence,
            report_at_ns,
            client_order_id.clone(),
            VenueReport::CancelAck,
        );
        Ok(())
    }

    pub fn on_market(&mut self, observation: MarketObservation) -> Result<(), SimulatorError> {
        if observation.at_ns < self.last_market_ns {
            return Err(SimulatorError::InvalidMarketTime {
                previous_ns: self.last_market_ns,
                received_ns: observation.at_ns,
            });
        }
        if observation.best_bid >= observation.best_ask {
            return Err(SimulatorError::CrossedMarket {
                best_bid: observation.best_bid.get(),
                best_ask: observation.best_ask.get(),
            });
        }
        let mut updates = Vec::new();
        let mut fills = Vec::new();
        for (client_order_id, order) in &self.orders {
            if order.remaining_lots == 0 || observation.at_ns < order.accepted_at_ns {
                continue;
            }
            if order
                .cancel_effective_at_ns
                .is_some_and(|effective| observation.at_ns >= effective)
            {
                continue;
            }
            let preview = preview_fill(self.config.fill_model, order, observation);
            if preview.queue_ahead_lots != order.request.queue_ahead_lots || preview.fill_lots != 0
            {
                updates.push((
                    client_order_id.clone(),
                    preview.queue_ahead_lots,
                    order.remaining_lots - preview.fill_lots,
                ));
            }
            if preview.fill_lots != 0 {
                fills.push((
                    client_order_id.clone(),
                    order.request.side,
                    order.request.price,
                    QtyLots::new(preview.fill_lots).expect("fill quantity is positive"),
                ));
            }
        }

        let fill_count =
            u64::try_from(fills.len()).map_err(|_| SimulatorError::ArithmeticOverflow)?;
        let next_execution = self
            .next_execution
            .checked_add(fill_count)
            .ok_or(SimulatorError::ArithmeticOverflow)?;
        let next_sequence = self
            .next_sequence
            .checked_add(fill_count)
            .ok_or(SimulatorError::ArithmeticOverflow)?;
        let report_at_ns = if fills.is_empty() {
            None
        } else {
            Some(
                observation
                    .at_ns
                    .checked_add(self.config.fill_report_latency_ns)
                    .ok_or(SimulatorError::ArithmeticOverflow)?,
            )
        };
        let mut reports = Vec::with_capacity(fills.len());
        for (offset, (client_order_id, side, price, qty)) in fills.into_iter().enumerate() {
            let offset = u64::try_from(offset).map_err(|_| SimulatorError::ArithmeticOverflow)?;
            let execution = self
                .next_execution
                .checked_add(offset)
                .ok_or(SimulatorError::ArithmeticOverflow)?;
            let sequence = self
                .next_sequence
                .checked_add(offset)
                .ok_or(SimulatorError::ArithmeticOverflow)?;
            let execution_id = format!("sim-{execution}");
            let fee_quote = i128::from(price.get())
                .checked_mul(i128::from(qty.get()))
                .and_then(|value| value.checked_mul(i128::from(self.config.maker_fee_bps)))
                .map(|value| value / 10_000)
                .ok_or(SimulatorError::ArithmeticOverflow)?;
            reports.push(TimedVenueReport {
                at_ns: report_at_ns.expect("fills have a report time"),
                client_order_id,
                report: VenueReport::Fill(Fill {
                    key: ExecutionKey::new(
                        &self.venue,
                        &self.account,
                        &self.instrument,
                        &execution_id,
                    ),
                    side,
                    price,
                    qty,
                    fee_quote,
                }),
                sequence,
            });
        }

        for (client_order_id, queue_ahead_lots, remaining_lots) in updates {
            let order = self
                .orders
                .get_mut(&client_order_id)
                .expect("order was planned from this map");
            order.request.queue_ahead_lots = queue_ahead_lots;
            order.remaining_lots = remaining_lots;
        }
        self.next_execution = next_execution;
        self.next_sequence = next_sequence;
        self.last_market_ns = observation.at_ns;
        self.reports.extend(reports);
        Ok(())
    }

    pub fn drain_reports(&mut self, through_ns: u64) -> Vec<TimedVenueReport> {
        let mut ready = Vec::new();
        let mut pending = Vec::new();
        for report in self.reports.drain(..) {
            if report.at_ns <= through_ns {
                ready.push(report);
            } else {
                pending.push(report);
            }
        }
        self.reports = pending;
        ready.sort_by_key(|report| (report.at_ns, report.sequence));
        ready
    }

    pub fn reconcile(
        &self,
        client_order_id: &ClientOrderId,
        at_ns: u64,
    ) -> Result<VenueOrderTruth, SimulatorError> {
        let order = self
            .orders
            .get(client_order_id)
            .ok_or_else(|| SimulatorError::UnknownOrder(client_order_id.clone()))?;
        let filled_lots = order.request.qty.get() - order.remaining_lots;
        let status = if order.remaining_lots == 0 {
            VenueOrderStatus::Filled
        } else if at_ns < order.accepted_at_ns {
            VenueOrderStatus::PendingArrival
        } else if order
            .cancel_effective_at_ns
            .is_some_and(|effective| effective <= at_ns)
        {
            VenueOrderStatus::Cancelled
        } else if order.cancel_effective_at_ns.is_some() {
            VenueOrderStatus::PendingCancel
        } else {
            VenueOrderStatus::Working
        };
        Ok(VenueOrderTruth {
            status,
            filled_lots,
            remaining_lots: order.remaining_lots,
        })
    }

    fn reserve_report_sequence(&mut self) -> Result<u64, SimulatorError> {
        let sequence = self.next_sequence;
        self.next_sequence = self
            .next_sequence
            .checked_add(1)
            .ok_or(SimulatorError::ArithmeticOverflow)?;
        Ok(sequence)
    }

    fn push_report(
        &mut self,
        sequence: u64,
        at_ns: u64,
        client_order_id: ClientOrderId,
        report: VenueReport,
    ) {
        self.reports.push(TimedVenueReport {
            at_ns,
            client_order_id,
            report,
            sequence,
        });
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FillPreview {
    fill_lots: i64,
    queue_ahead_lots: i64,
}

fn preview_fill(
    model: FillModel,
    order: &WorkingOrder,
    observation: MarketObservation,
) -> FillPreview {
    let unchanged = |fill_lots| FillPreview {
        fill_lots,
        queue_ahead_lots: order.request.queue_ahead_lots,
    };
    match model {
        FillModel::Touch => {
            let touched = match order.request.side {
                Side::Buy => observation.best_ask <= order.request.price,
                Side::Sell => observation.best_bid >= order.request.price,
            };
            unchanged(if touched { order.remaining_lots } else { 0 })
        }
        FillModel::TradeThrough => unchanged(observation.trade.map_or(0, |trade| {
            let through = match order.request.side {
                Side::Buy => trade.aggressor == Side::Sell && trade.price < order.request.price,
                Side::Sell => trade.aggressor == Side::Buy && trade.price > order.request.price,
            };
            if through { order.remaining_lots } else { 0 }
        })),
        FillModel::L2Queue => observation.trade.map_or_else(
            || unchanged(0),
            |trade| {
                let opposing = match order.request.side {
                    Side::Buy => trade.aggressor == Side::Sell,
                    Side::Sell => trade.aggressor == Side::Buy,
                };
                if !opposing {
                    return unchanged(0);
                }
                let through = match order.request.side {
                    Side::Buy => trade.price < order.request.price,
                    Side::Sell => trade.price > order.request.price,
                };
                if through {
                    return unchanged(order.remaining_lots);
                }
                if trade.price != order.request.price {
                    return unchanged(0);
                }
                let queue_consumed = order.request.queue_ahead_lots.min(trade.qty.get());
                FillPreview {
                    fill_lots: (trade.qty.get() - queue_consumed).min(order.remaining_lots),
                    queue_ahead_lots: order.request.queue_ahead_lots - queue_consumed,
                }
            },
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn price(value: i64) -> PriceTicks {
        PriceTicks::new(value).unwrap()
    }

    fn qty(value: i64) -> QtyLots {
        QtyLots::new(value).unwrap()
    }

    fn config(model: FillModel) -> SimulatorConfig {
        SimulatorConfig {
            send_latency_ns: 5,
            new_ack_latency_ns: 20,
            cancel_latency_ns: 10,
            cancel_ack_latency_ns: 5,
            fill_report_latency_ns: 2,
            maker_fee_bps: 2,
            fill_model: model,
        }
    }

    fn request(id: &str, side: Side, price_ticks: i64, qty_lots: i64) -> SimOrderRequest {
        SimOrderRequest {
            client_order_id: ClientOrderId::new(id).unwrap(),
            side,
            price: price(price_ticks),
            qty: qty(qty_lots),
            queue_ahead_lots: 0,
        }
    }

    #[test]
    fn fill_report_can_arrive_before_new_ack() {
        let mut venue = SimulatedVenue::new(config(FillModel::L2Queue), "SIM", "paper", "BTC");
        venue
            .submit(request("order-1", Side::Buy, 100, 2), 1_000)
            .unwrap();
        venue
            .on_market(MarketObservation {
                at_ns: 1_006,
                best_bid: price(100),
                best_ask: price(101),
                trade: Some(MarketTrade {
                    aggressor: Side::Sell,
                    price: price(100),
                    qty: qty(2),
                }),
            })
            .unwrap();

        let reports = venue.drain_reports(2_000);
        assert!(matches!(reports[0].report, VenueReport::Fill(_)));
        assert_eq!(reports[0].at_ns, 1_008);
        assert_eq!(reports[1].report, VenueReport::NewAck);
        assert_eq!(reports[1].at_ns, 1_025);
    }

    #[test]
    fn queue_model_consumes_ahead_before_filling() {
        let mut venue = SimulatedVenue::new(config(FillModel::L2Queue), "SIM", "paper", "BTC");
        let mut order = request("order-1", Side::Buy, 100, 3);
        order.queue_ahead_lots = 4;
        venue.submit(order, 0).unwrap();

        venue
            .on_market(MarketObservation {
                at_ns: 5,
                best_bid: price(100),
                best_ask: price(101),
                trade: Some(MarketTrade {
                    aggressor: Side::Sell,
                    price: price(100),
                    qty: qty(3),
                }),
            })
            .unwrap();
        venue
            .on_market(MarketObservation {
                at_ns: 6,
                best_bid: price(100),
                best_ask: price(101),
                trade: Some(MarketTrade {
                    aggressor: Side::Sell,
                    price: price(100),
                    qty: qty(3),
                }),
            })
            .unwrap();

        let reports = venue.drain_reports(10);
        let VenueReport::Fill(fill) = &reports[0].report else {
            panic!("expected a fill report");
        };
        assert_eq!(fill.qty, qty(2));
        assert_eq!(
            venue
                .reconcile(&ClientOrderId::new("order-1").unwrap(), 10)
                .unwrap(),
            VenueOrderTruth {
                status: VenueOrderStatus::Working,
                filled_lots: 2,
                remaining_lots: 1,
            }
        );
    }

    #[test]
    fn cancel_in_flight_allows_fills_but_effective_cancel_blocks_them() {
        let mut venue = SimulatedVenue::new(config(FillModel::L2Queue), "SIM", "paper", "BTC");
        let id = ClientOrderId::new("order-1").unwrap();
        venue
            .submit(request(id.as_str(), Side::Sell, 101, 2), 0)
            .unwrap();
        venue.cancel(&id, 10).unwrap();

        venue
            .on_market(MarketObservation {
                at_ns: 15,
                best_bid: price(100),
                best_ask: price(101),
                trade: Some(MarketTrade {
                    aggressor: Side::Buy,
                    price: price(101),
                    qty: qty(1),
                }),
            })
            .unwrap();
        venue
            .on_market(MarketObservation {
                at_ns: 20,
                best_bid: price(100),
                best_ask: price(101),
                trade: Some(MarketTrade {
                    aggressor: Side::Buy,
                    price: price(101),
                    qty: qty(1),
                }),
            })
            .unwrap();

        assert_eq!(
            venue.reconcile(&id, 30).unwrap(),
            VenueOrderTruth {
                status: VenueOrderStatus::Cancelled,
                filled_lots: 1,
                remaining_lots: 1,
            }
        );
    }

    #[test]
    fn submit_is_atomic_when_report_sequence_is_exhausted() {
        let mut venue = SimulatedVenue::new(config(FillModel::Touch), "SIM", "paper", "BTC");
        let id = ClientOrderId::new("order-1").unwrap();
        venue.next_sequence = u64::MAX;

        assert_eq!(
            venue.submit(request(id.as_str(), Side::Buy, 100, 1), 0),
            Err(SimulatorError::ArithmeticOverflow)
        );
        assert_eq!(
            venue.reconcile(&id, 0),
            Err(SimulatorError::UnknownOrder(id))
        );
        assert!(venue.reports.is_empty());
        assert_eq!(venue.next_sequence, u64::MAX);
    }

    #[test]
    fn cancel_is_atomic_when_report_sequence_is_exhausted() {
        let mut venue = SimulatedVenue::new(config(FillModel::Touch), "SIM", "paper", "BTC");
        let id = ClientOrderId::new("order-1").unwrap();
        venue
            .submit(request(id.as_str(), Side::Buy, 100, 1), 0)
            .unwrap();
        venue.drain_reports(u64::MAX);
        venue.next_sequence = u64::MAX;

        assert_eq!(
            venue.cancel(&id, 10),
            Err(SimulatorError::ArithmeticOverflow)
        );
        assert_eq!(
            venue.reconcile(&id, 100).unwrap(),
            VenueOrderTruth {
                status: VenueOrderStatus::Working,
                filled_lots: 0,
                remaining_lots: 1,
            }
        );
        assert!(venue.reports.is_empty());
        assert_eq!(venue.next_sequence, u64::MAX);
    }

    #[test]
    fn market_fill_is_atomic_when_identifiers_are_exhausted() {
        let mut venue = SimulatedVenue::new(config(FillModel::L2Queue), "SIM", "paper", "BTC");
        let id = ClientOrderId::new("order-1").unwrap();
        let mut order = request(id.as_str(), Side::Buy, 100, 2);
        order.queue_ahead_lots = 1;
        venue.submit(order, 0).unwrap();
        venue.drain_reports(u64::MAX);
        let observation = MarketObservation {
            at_ns: 5,
            best_bid: price(100),
            best_ask: price(101),
            trade: Some(MarketTrade {
                aggressor: Side::Sell,
                price: price(100),
                qty: qty(2),
            }),
        };

        venue.next_sequence = u64::MAX;
        assert_eq!(
            venue.on_market(observation),
            Err(SimulatorError::ArithmeticOverflow)
        );
        venue.next_sequence = 1;
        venue.next_execution = u64::MAX;
        assert_eq!(
            venue.on_market(observation),
            Err(SimulatorError::ArithmeticOverflow)
        );

        let order = venue.orders.get(&id).unwrap();
        assert_eq!(order.request.queue_ahead_lots, 1);
        assert_eq!(order.remaining_lots, 2);
        assert_eq!(venue.last_market_ns, 0);
        assert!(venue.reports.is_empty());
    }
}
