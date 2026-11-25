use quant_engine::research::benjamini_hochberg;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let result = benjamini_hochberg(&[0.001, 0.010, 0.030, 0.200], 0.05)?;
    assert_eq!(result.rejected_indices, [0, 1, 2]);
    assert_eq!(result.cutoff, Some(0.030));
    Ok(())
}
