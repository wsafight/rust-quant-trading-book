//! 本书的可运行配套工程。
//!
//! 模块刻意保持小而明确，供读者逐章扩展；默认不包含真实交易所连接。

pub mod domain;
pub mod execution;
pub mod ledger;
pub mod ofi;
pub mod oms;
pub mod options;
pub mod order_book;
pub mod pairs;
pub mod portfolio;
pub mod replay;
pub mod research;
pub mod risk;
pub mod simulator;
pub mod venue_fixture;
