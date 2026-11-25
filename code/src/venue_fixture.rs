use std::fmt;

use serde::Deserialize;

use crate::domain::PriceTicks;
use crate::order_book::{Delta, Level, Snapshot};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DecimalScale {
    pub price_decimals: u32,
    pub qty_decimals: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedDepthDelta {
    pub symbol: String,
    pub event_time_ms: u64,
    pub delta: Delta,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FixtureError {
    InvalidJson(String),
    InvalidDecimal(String),
    NegativeValue(String),
    TooPrecise { value: String, decimals: u32 },
    NumericOverflow(String),
    ZeroPrice,
}

impl fmt::Display for FixtureError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidJson(message) => write!(f, "invalid fixture JSON: {message}"),
            Self::InvalidDecimal(value) => write!(f, "invalid decimal: {value}"),
            Self::NegativeValue(value) => write!(f, "fixture value cannot be negative: {value}"),
            Self::TooPrecise { value, decimals } => {
                write!(f, "decimal exceeds {decimals} places: {value}")
            }
            Self::NumericOverflow(value) => write!(f, "decimal does not fit in i64: {value}"),
            Self::ZeroPrice => f.write_str("price cannot be zero"),
        }
    }
}

impl std::error::Error for FixtureError {}

#[derive(Debug, Deserialize)]
struct RawSnapshot {
    #[serde(rename = "lastUpdateId")]
    last_update_id: u64,
    bids: Vec<[String; 2]>,
    asks: Vec<[String; 2]>,
}

#[derive(Debug, Deserialize)]
struct RawDepthDelta {
    #[serde(rename = "E")]
    event_time_ms: u64,
    #[serde(rename = "s")]
    symbol: String,
    #[serde(rename = "U")]
    first_update_id: u64,
    #[serde(rename = "u")]
    final_update_id: u64,
    #[serde(rename = "b")]
    bids: Vec<[String; 2]>,
    #[serde(rename = "a")]
    asks: Vec<[String; 2]>,
}

pub fn decode_snapshot(json: &str, scale: DecimalScale) -> Result<Snapshot, FixtureError> {
    let raw: RawSnapshot =
        serde_json::from_str(json).map_err(|error| FixtureError::InvalidJson(error.to_string()))?;
    Ok(Snapshot {
        sequence: raw.last_update_id,
        bids: normalize_levels(raw.bids, scale)?,
        asks: normalize_levels(raw.asks, scale)?,
    })
}

pub fn decode_delta(json: &str, scale: DecimalScale) -> Result<NormalizedDepthDelta, FixtureError> {
    let raw: RawDepthDelta =
        serde_json::from_str(json).map_err(|error| FixtureError::InvalidJson(error.to_string()))?;
    Ok(NormalizedDepthDelta {
        symbol: raw.symbol,
        event_time_ms: raw.event_time_ms,
        delta: Delta {
            first_sequence: raw.first_update_id,
            last_sequence: raw.final_update_id,
            bids: normalize_levels(raw.bids, scale)?,
            asks: normalize_levels(raw.asks, scale)?,
        },
    })
}

fn normalize_levels(
    levels: Vec<[String; 2]>,
    scale: DecimalScale,
) -> Result<Vec<Level>, FixtureError> {
    levels
        .into_iter()
        .map(|[price, qty]| {
            let price_ticks = parse_decimal(&price, scale.price_decimals)?;
            let qty_lots = parse_decimal(&qty, scale.qty_decimals)?;
            Ok((
                PriceTicks::new(price_ticks).map_err(|_| FixtureError::ZeroPrice)?,
                qty_lots,
            ))
        })
        .collect()
}

pub fn parse_decimal(value: &str, decimals: u32) -> Result<i64, FixtureError> {
    if value.starts_with('-') {
        return Err(FixtureError::NegativeValue(value.into()));
    }
    let value = value.strip_prefix('+').unwrap_or(value);
    let (whole, fraction) = value.split_once('.').unwrap_or((value, ""));
    if whole.is_empty()
        || !whole.bytes().all(|byte| byte.is_ascii_digit())
        || !fraction.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(FixtureError::InvalidDecimal(value.into()));
    }
    let decimals_usize =
        usize::try_from(decimals).map_err(|_| FixtureError::NumericOverflow(value.into()))?;
    if fraction.len() > decimals_usize
        && !fraction[decimals_usize..].bytes().all(|byte| byte == b'0')
    {
        return Err(FixtureError::TooPrecise {
            value: value.into(),
            decimals,
        });
    }
    let factor = 10_i128
        .checked_pow(decimals)
        .ok_or_else(|| FixtureError::NumericOverflow(value.into()))?;
    let whole = whole
        .parse::<i128>()
        .map_err(|_| FixtureError::NumericOverflow(value.into()))?;
    let kept_fraction = &fraction[..fraction.len().min(decimals_usize)];
    let fraction_value = if kept_fraction.is_empty() {
        0
    } else {
        kept_fraction
            .parse::<i128>()
            .map_err(|_| FixtureError::NumericOverflow(value.into()))?
    };
    let padding = decimals_usize.saturating_sub(kept_fraction.len());
    let padding =
        u32::try_from(padding).map_err(|_| FixtureError::NumericOverflow(value.into()))?;
    let fraction_value = fraction_value
        .checked_mul(
            10_i128
                .checked_pow(padding)
                .ok_or_else(|| FixtureError::NumericOverflow(value.into()))?,
        )
        .ok_or_else(|| FixtureError::NumericOverflow(value.into()))?;
    let scaled = whole
        .checked_mul(factor)
        .and_then(|scaled_whole| scaled_whole.checked_add(fraction_value))
        .ok_or_else(|| FixtureError::NumericOverflow(value.into()))?;
    i64::try_from(scaled).map_err(|_| FixtureError::NumericOverflow(value.into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::order_book::OrderBook;

    const SCALE: DecimalScale = DecimalScale {
        price_decimals: 2,
        qty_decimals: 2,
    };

    #[test]
    fn frozen_fixture_builds_a_continuous_book() {
        let mut book = OrderBook::default();
        book.apply_snapshot(
            decode_snapshot(
                include_str!("../fixtures/binance-spot-btcusdt-snapshot.json"),
                SCALE,
            )
            .unwrap(),
        )
        .unwrap();
        for line in include_str!("../fixtures/binance-spot-btcusdt-deltas.jsonl").lines() {
            book.apply_delta(decode_delta(line, SCALE).unwrap().delta)
                .unwrap();
        }
        assert_eq!(book.last_sequence(), Some(103));
        assert_eq!(
            book.best_bid(),
            Some((PriceTicks::new(10_001).unwrap(), 50))
        );
        assert_eq!(
            book.best_ask(),
            Some((PriceTicks::new(10_003).unwrap(), 75))
        );
    }

    #[test]
    fn decimal_parser_rejects_nonzero_excess_precision() {
        assert_eq!(parse_decimal("100.0100", 2), Ok(10_001));
        assert_eq!(
            parse_decimal("100.011", 2),
            Err(FixtureError::TooPrecise {
                value: "100.011".into(),
                decimals: 2,
            })
        );
    }
}
