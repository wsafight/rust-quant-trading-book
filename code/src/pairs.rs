#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PairLegState {
    Flat,
    LegAFilledWaitingHedge {
        unhedged_lots: i64,
        filled_at_ns: u64,
    },
    HedgedSpread {
        spread_lots: i64,
    },
    EmergencyFlattening {
        remaining_lots: i64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpreadSignal {
    Flat,
    LongSpread,
    ShortSpread,
    StopLossRegimeBreak,
}

/// Computes Z-score with strict finiteness and near-zero std guards.
pub fn z_score(spread: f64, mean: f64, std: f64) -> Option<f64> {
    if !spread.is_finite() || !mean.is_finite() || !std.is_finite() || std <= 1e-12 {
        return None;
    }
    let result = (spread - mean) / std;
    result.is_finite().then_some(result)
}

/// Evaluates pair trading signal with a hard regime-break stop-loss ceiling.
pub fn evaluate_spread(z: f64, entry_z: f64, stop_z: f64) -> Option<SpreadSignal> {
    if !z.is_finite()
        || !entry_z.is_finite()
        || !stop_z.is_finite()
        || entry_z <= 0.0
        || stop_z <= entry_z
    {
        return None;
    }
    if z.abs() >= stop_z {
        Some(SpreadSignal::StopLossRegimeBreak)
    } else if z >= entry_z {
        Some(SpreadSignal::ShortSpread)
    } else if z <= -entry_z {
        Some(SpreadSignal::LongSpread)
    } else {
        Some(SpreadSignal::Flat)
    }
}

/// Transitions an unhedged single-leg position into emergency flatten if hedge timeout elapsed,
/// or fail-closed if the clock moved backwards (`now_ns < filled_at_ns`).
pub fn check_legging_timeout(
    state: PairLegState,
    now_ns: u64,
    max_hedge_delay_ns: u64,
) -> PairLegState {
    match state {
        PairLegState::LegAFilledWaitingHedge {
            unhedged_lots,
            filled_at_ns,
        } if now_ns < filled_at_ns || now_ns - filled_at_ns > max_hedge_delay_ns => {
            PairLegState::EmergencyFlattening {
                remaining_lots: unhedged_lots,
            }
        }
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn z_score_rejects_zero_or_non_finite_std() {
        assert_eq!(z_score(10.0, 10.0, 0.0), None);
        assert_eq!(z_score(10.0, 10.0, f64::NAN), None);
        assert_eq!(z_score(f64::MAX, -f64::MAX, 1.0), None);
        assert_eq!(z_score(f64::MAX, 0.0, 0.5), None);
        let z = z_score(12.0, 10.0, 1.0).expect("valid z-score");
        assert!((z - 2.0).abs() < 1e-12);
    }

    #[test]
    fn extreme_z_triggers_regime_break_stop_loss() {
        assert_eq!(
            evaluate_spread(2.5, 2.0, 4.5),
            Some(SpreadSignal::ShortSpread)
        );
        assert_eq!(
            evaluate_spread(5.0, 2.0, 4.5),
            Some(SpreadSignal::StopLossRegimeBreak)
        );
    }

    #[test]
    fn legging_timeout_triggers_emergency_flatten() {
        let waiting = PairLegState::LegAFilledWaitingHedge {
            unhedged_lots: 10,
            filled_at_ns: 1_000,
        };
        assert_eq!(check_legging_timeout(waiting, 1_400, 500), waiting);
        assert_eq!(
            check_legging_timeout(waiting, 1_600, 500),
            PairLegState::EmergencyFlattening { remaining_lots: 10 }
        );
        // Clock rollback must fail-closed instead of saturating to zero elapsed time.
        assert_eq!(
            check_legging_timeout(waiting, 900, 500),
            PairLegState::EmergencyFlattening { remaining_lots: 10 }
        );
    }
}
