use std::f64::consts::PI;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct OptionInput {
    pub spot: f64,
    pub strike: f64,
    pub time_years: f64,
    pub iv: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CallGreeks {
    pub price: f64,
    pub delta: f64,
    pub gamma: f64,
    pub vega_per_pct: f64,
    pub theta_per_day: f64,
}

impl OptionInput {
    pub fn validate(self) -> Option<Self> {
        let valid = self.spot > 0.0
            && self.strike > 0.0
            && self.time_years > 0.0
            && self.iv > 0.0
            && self.spot.is_finite()
            && self.strike.is_finite()
            && self.time_years.is_finite()
            && self.iv.is_finite();
        valid.then_some(self)
    }
}

fn norm_pdf(x: f64) -> f64 {
    (-0.5 * x * x).exp() / (2.0 * PI).sqrt()
}

/// Abramowitz & Stegun approximation for standard normal CDF (max error < 1.5e-7).
fn norm_cdf(x: f64) -> f64 {
    let sign = if x < 0.0 { -1.0 } else { 1.0 };
    let ax = x.abs() / std::f64::consts::SQRT_2;
    let t = 1.0 / (1.0 + 0.3275911 * ax);
    let poly = (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t)
        + 0.254829592)
        * t;
    let y = 1.0 - poly * (-ax * ax).exp();
    0.5 * (1.0 + sign * y)
}

/// Computes Black-Scholes call price and Greeks (zero risk-free rate for crypto/futures intuition).
pub fn black_scholes_call(input: OptionInput) -> Option<CallGreeks> {
    let inp = input.validate()?;
    let sqrt_t = inp.time_years.sqrt();
    let vol_sqrt_t = inp.iv * sqrt_t;
    if !vol_sqrt_t.is_finite() || vol_sqrt_t <= 0.0 {
        return None;
    }
    let d1 = ((inp.spot / inp.strike).ln() + 0.5 * inp.iv * inp.iv * inp.time_years) / vol_sqrt_t;
    let d2 = d1 - vol_sqrt_t;
    if !d1.is_finite() || !d2.is_finite() {
        return None;
    }

    let pdf_d1 = norm_pdf(d1);
    let delta = norm_cdf(d1);
    let price = (inp.spot * delta - inp.strike * norm_cdf(d2)).max(0.0);
    let gamma = pdf_d1 / (inp.spot * vol_sqrt_t);
    let vega_per_pct = (inp.spot * pdf_d1 * sqrt_t) / 100.0;
    let theta_per_day = -(inp.spot * pdf_d1 * inp.iv) / (2.0 * sqrt_t) / 365.0;

    if ![price, delta, gamma, vega_per_pct, theta_per_day]
        .into_iter()
        .all(f64::is_finite)
    {
        return None;
    }

    Some(CallGreeks {
        price,
        delta,
        gamma,
        vega_per_pct,
        theta_per_day,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_positive_time_or_iv() {
        let bad = OptionInput {
            spot: 100.0,
            strike: 100.0,
            time_years: 0.0,
            iv: 0.45,
        };
        assert_eq!(black_scholes_call(bad), None);
    }

    #[test]
    fn atm_call_has_delta_near_half_and_positive_gamma_negative_theta() {
        let g = black_scholes_call(OptionInput {
            spot: 100.0,
            strike: 100.0,
            time_years: 14.0 / 365.0,
            iv: 0.45,
        })
        .expect("valid atm call");
        assert!(g.delta > 0.5 && g.delta < 0.55);
        assert!(g.gamma > 0.0);
        assert!(g.vega_per_pct > 0.0);
        assert!(g.theta_per_day < 0.0);
    }

    #[test]
    fn norm_cdf_matches_reference_quantiles() {
        assert!((norm_cdf(0.0) - 0.5).abs() < 1e-7);
        assert!((norm_cdf(1.959_963_984_5) - 0.975).abs() < 1e-6);
        assert!((norm_cdf(-1.959_963_984_5) - 0.025).abs() < 1e-6);
    }

    #[test]
    fn rejects_underflowing_vol_sqrt_time() {
        let extreme = OptionInput {
            spot: 100.0,
            strike: 100.0,
            time_years: f64::MIN_POSITIVE,
            iv: f64::MIN_POSITIVE,
        };
        assert_eq!(black_scholes_call(extreme), None);
    }
}
