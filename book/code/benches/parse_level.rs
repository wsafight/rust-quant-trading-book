use std::hint::black_box;

use criterion::{Criterion, criterion_group, criterion_main};

fn parse_level(raw: &str) -> (i64, i64) {
    let (price, qty) = raw.split_once(',').expect("fixture has one comma");
    (
        price.parse().expect("fixture price is an integer"),
        qty.parse().expect("fixture quantity is an integer"),
    )
}

fn bench_parse(c: &mut Criterion) {
    c.bench_function("parse level", |b| {
        b.iter(|| parse_level(black_box("6000000,42")))
    });
}

criterion_group!(benches, bench_parse);
criterion_main!(benches);
