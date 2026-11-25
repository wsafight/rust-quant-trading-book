use std::cmp::Ordering;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TopOfBook {
    pub bid_px: i64,
    pub bid_qty: i64,
    pub ask_px: i64,
    pub ask_qty: i64,
}

/// Computes single-level Order Flow Imbalance (Cont-Kukanov-Stoikov) with strict
/// non-negative quantity, non-crossed book, and checked arithmetic guards.
pub fn try_compute_ofi(prev: TopOfBook, curr: TopOfBook) -> Option<i64> {
    let valid_book = |b: TopOfBook| b.bid_qty >= 0 && b.ask_qty >= 0 && b.bid_px < b.ask_px;
    if !valid_book(prev) || !valid_book(curr) {
        return None;
    }

    let delta_bid = match curr.bid_px.cmp(&prev.bid_px) {
        Ordering::Greater => curr.bid_qty,
        Ordering::Equal => curr.bid_qty.checked_sub(prev.bid_qty)?,
        Ordering::Less => prev.bid_qty.checked_neg()?,
    };
    let delta_ask = match curr.ask_px.cmp(&prev.ask_px) {
        Ordering::Less => curr.ask_qty,
        Ordering::Equal => curr.ask_qty.checked_sub(prev.ask_qty)?,
        Ordering::Greater => prev.ask_qty.checked_neg()?,
    };
    delta_bid.checked_sub(delta_ask)
}

/// Computes single-level Order Flow Imbalance (Cont-Kukanov-Stoikov) using saturating arithmetic.
/// Positive OFI indicates net buying pressure (bid additions or ask cancellations).
pub fn compute_ofi(prev: TopOfBook, curr: TopOfBook) -> i64 {
    let delta_bid = match curr.bid_px.cmp(&prev.bid_px) {
        Ordering::Greater => curr.bid_qty,
        Ordering::Equal => curr.bid_qty.saturating_sub(prev.bid_qty),
        Ordering::Less => prev.bid_qty.saturating_neg(),
    };
    let delta_ask = match curr.ask_px.cmp(&prev.ask_px) {
        Ordering::Less => curr.ask_qty,
        Ordering::Equal => curr.ask_qty.saturating_sub(prev.ask_qty),
        Ordering::Greater => prev.ask_qty.saturating_neg(),
    };
    delta_bid.saturating_sub(delta_ask)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ask_cancellation_produces_positive_ofi() {
        let prev = TopOfBook {
            bid_px: 10000,
            bid_qty: 20,
            ask_px: 10001,
            ask_qty: 30,
        };
        let curr = TopOfBook {
            bid_px: 10000,
            bid_qty: 25,
            ask_px: 10001,
            ask_qty: 10,
        };
        // delta_bid = +5, delta_ask = -20 => OFI = +25
        assert_eq!(compute_ofi(prev, curr), 25);
    }

    #[test]
    fn bid_drop_produces_negative_ofi() {
        let prev = TopOfBook {
            bid_px: 10000,
            bid_qty: 18,
            ask_px: 10001,
            ask_qty: 12,
        };
        let curr = TopOfBook {
            bid_px: 9999,
            bid_qty: 40,
            ask_px: 10000,
            ask_qty: 15,
        };
        // delta_bid = -18, delta_ask = +15 => OFI = -33
        assert_eq!(compute_ofi(prev, curr), -33);
        assert_eq!(try_compute_ofi(prev, curr), Some(-33));
    }

    #[test]
    fn try_compute_ofi_rejects_crossed_or_overflowing_inputs() {
        let crossed = TopOfBook {
            bid_px: 10001,
            bid_qty: 10,
            ask_px: 10000,
            ask_qty: 10,
        };
        let valid = TopOfBook {
            bid_px: 10000,
            bid_qty: 10,
            ask_px: 10001,
            ask_qty: 10,
        };
        assert_eq!(try_compute_ofi(crossed, valid), None);

        let huge_prev = TopOfBook {
            bid_px: 10000,
            bid_qty: 0,
            ask_px: 10001,
            ask_qty: i64::MAX,
        };
        let huge_curr = TopOfBook {
            bid_px: 10000,
            bid_qty: i64::MAX,
            ask_px: 10001,
            ask_qty: 0,
        };
        assert_eq!(try_compute_ofi(huge_prev, huge_curr), None);
        assert_eq!(compute_ofi(huge_prev, huge_curr), i64::MAX);
    }
}
