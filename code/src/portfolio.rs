/// Computes inverse-volatility (naive risk-parity) weights on the stack using const generics.
pub fn inverse_vol_weights<const N: usize>(vols: [f64; N]) -> Option<[f64; N]> {
    if N == 0 {
        return None;
    }
    let mut inv = [0.0; N];
    let mut sum = 0.0;
    for i in 0..N {
        if !vols[i].is_finite() || vols[i] <= 0.0 {
            return None;
        }
        inv[i] = 1.0 / vols[i];
        sum += inv[i];
    }
    if !sum.is_finite() || sum <= 0.0 {
        return None;
    }
    for w in &mut inv {
        *w /= sum;
    }
    Some(inv)
}

/// Computes portfolio annualized volatility given weights, individual vols, and uniform pairwise correlation.
pub fn portfolio_vol_uniform_corr<const N: usize>(
    weights: [f64; N],
    vols: [f64; N],
    corr: f64,
) -> Option<f64> {
    if N == 0 || !corr.is_finite() || !(-1.0..=1.0).contains(&corr) {
        return None;
    }
    if N > 1 {
        // An N x N equicorrelation matrix is positive semidefinite iff corr >= -1 / (N - 1).
        let min_corr = -1.0 / ((N - 1) as f64);
        if corr < min_corr {
            return None;
        }
    }
    let mut variance = 0.0;
    for i in 0..N {
        if !weights[i].is_finite() || !vols[i].is_finite() || vols[i] < 0.0 {
            return None;
        }
        for j in 0..N {
            let rho = if i == j { 1.0 } else { corr };
            variance += weights[i] * weights[j] * vols[i] * vols[j] * rho;
        }
    }
    if !variance.is_finite() || variance < -1e-12 {
        return None;
    }
    Some(variance.max(0.0).sqrt())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inverse_vol_weights_rejects_zero_and_normalizes_to_one() {
        assert_eq!(inverse_vol_weights([0.1, 0.0, 0.2]), None);
        assert_eq!(inverse_vol_weights([0.1, f64::NAN, 0.2]), None);

        let w = inverse_vol_weights([0.08, 0.12, 0.36]).expect("valid weights");
        let sum: f64 = w.iter().sum();
        assert!((sum - 1.0).abs() < 1e-12);
        assert!(w[0] > w[1] && w[1] > w[2]);
    }

    #[test]
    fn correlation_spike_increases_portfolio_volatility() {
        let vols = [0.08, 0.12, 0.32];
        let w = inverse_vol_weights(vols).expect("valid weights");
        let calm = portfolio_vol_uniform_corr(w, vols, 0.15).expect("calm vol");
        let crisis = portfolio_vol_uniform_corr(w, vols, 0.92).expect("crisis vol");
        assert!(crisis > calm);
    }

    #[test]
    fn rejects_empty_or_non_psd_uniform_correlation() {
        assert_eq!(portfolio_vol_uniform_corr([], [], 0.0), None);
        // For N=3, minimum valid equicorrelation is -0.5.
        assert_eq!(
            portfolio_vol_uniform_corr([1.0 / 3.0; 3], [0.2; 3], -0.6),
            None
        );
        // Boundary corr = -0.5 with equal weights and equal vols cancels variance to 0.
        let zero_vol =
            portfolio_vol_uniform_corr([1.0 / 3.0; 3], [0.2; 3], -0.5).expect("psd boundary");
        assert!(zero_vol.abs() < 1e-7);
    }
}
