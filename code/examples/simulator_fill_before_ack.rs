use quant_engine::domain::{ClientOrderId, PriceTicks, QtyLots, Side};
use quant_engine::simulator::{
    FillModel, MarketObservation, MarketTrade, SimOrderRequest, SimulatedVenue, SimulatorConfig,
    VenueReport,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
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
    venue.submit(
        SimOrderRequest {
            client_order_id: ClientOrderId::new("example-1")?,
            side: Side::Buy,
            price: PriceTicks::new(100)?,
            qty: QtyLots::new(2)?,
            queue_ahead_lots: 0,
        },
        1_000,
    )?;

    venue.on_market(MarketObservation {
        at_ns: 1_006,
        best_bid: PriceTicks::new(100)?,
        best_ask: PriceTicks::new(101)?,
        trade: Some(MarketTrade {
            aggressor: Side::Sell,
            price: PriceTicks::new(100)?,
            qty: QtyLots::new(2)?,
        }),
    })?;

    let reports = venue.drain_reports(2_000);
    assert!(matches!(reports[0].report, VenueReport::Fill(_)));
    assert_eq!(reports[0].at_ns, 1_008);
    assert_eq!(reports[1].report, VenueReport::NewAck);
    assert_eq!(reports[1].at_ns, 1_025);
    Ok(())
}
