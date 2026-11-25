use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub enum ResearchError {
    InvalidFalseDiscoveryRate(f64),
    InvalidPValue { index: usize, value: f64 },
}

impl fmt::Display for ResearchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidFalseDiscoveryRate(value) => {
                write!(f, "false discovery rate must be in (0, 1]: {value}")
            }
            Self::InvalidPValue { index, value } => {
                write!(f, "p-value at index {index} is outside [0, 1]: {value}")
            }
        }
    }
}

impl std::error::Error for ResearchError {}

#[derive(Debug, Clone, PartialEq)]
pub struct BhResult {
    pub rejected_indices: Vec<usize>,
    pub cutoff: Option<f64>,
}

/// Applies the Benjamini-Hochberg step-up procedure to one declared family.
pub fn benjamini_hochberg(
    p_values: &[f64],
    false_discovery_rate: f64,
) -> Result<BhResult, ResearchError> {
    if !false_discovery_rate.is_finite()
        || false_discovery_rate <= 0.0
        || false_discovery_rate > 1.0
    {
        return Err(ResearchError::InvalidFalseDiscoveryRate(
            false_discovery_rate,
        ));
    }
    for (index, &value) in p_values.iter().enumerate() {
        if !value.is_finite() || !(0.0..=1.0).contains(&value) {
            return Err(ResearchError::InvalidPValue { index, value });
        }
    }
    if p_values.is_empty() {
        return Ok(BhResult {
            rejected_indices: Vec::new(),
            cutoff: None,
        });
    }

    let mut ranked: Vec<_> = p_values.iter().copied().enumerate().collect();
    ranked.sort_by(|left, right| left.1.total_cmp(&right.1));
    let count = ranked.len() as f64;
    let cutoff = ranked
        .iter()
        .enumerate()
        .filter_map(|(rank, &(_, p_value))| {
            let threshold = (rank + 1) as f64 * false_discovery_rate / count;
            (p_value <= threshold).then_some(p_value)
        })
        .next_back();
    let mut rejected_indices = cutoff.map_or_else(Vec::new, |cutoff| {
        p_values
            .iter()
            .enumerate()
            .filter_map(|(index, &p_value)| (p_value <= cutoff).then_some(index))
            .collect()
    });
    rejected_indices.sort_unstable();
    Ok(BhResult {
        rejected_indices,
        cutoff,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bh_rejects_only_the_step_up_prefix() {
        let result = benjamini_hochberg(&[0.001, 0.010, 0.030, 0.200], 0.05).unwrap();
        assert_eq!(result.rejected_indices, [0, 1, 2]);
        assert_eq!(result.cutoff, Some(0.030));
    }

    #[test]
    fn bh_rejects_invalid_inputs() {
        assert!(matches!(
            benjamini_hochberg(&[0.01, f64::NAN], 0.05),
            Err(ResearchError::InvalidPValue { index: 1, .. })
        ));
        assert!(matches!(
            benjamini_hochberg(&[0.01], 0.0),
            Err(ResearchError::InvalidFalseDiscoveryRate(_))
        ));
    }
}
