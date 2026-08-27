use std::time::Duration;

use tokio::sync::mpsc;

#[derive(Debug, PartialEq, Eq)]
struct MarketEvent {
    sequence: u64,
}

#[tokio::test]
async fn bounded_channel_delivers_before_close() {
    let (tx, mut rx) = mpsc::channel::<MarketEvent>(2);
    let producer = tokio::spawn(async move {
        tx.send(MarketEvent { sequence: 1 }).await?;
        tx.send(MarketEvent { sequence: 2 }).await?;
        Ok::<_, mpsc::error::SendError<MarketEvent>>(())
    });

    let mut sequences = Vec::new();
    while let Some(event) = rx.recv().await {
        sequences.push(event.sequence);
    }
    producer.await.unwrap().unwrap();
    assert_eq!(sequences, vec![1, 2]);
}

#[tokio::test]
async fn spawned_tasks_return_owned_results() {
    let left = tokio::spawn(async { 20_u64 });
    let right = tokio::spawn(async { 22_u64 });
    assert_eq!(left.await.unwrap() + right.await.unwrap(), 42);
}

#[tokio::test(start_paused = true)]
async fn timeout_is_a_local_waiting_boundary() {
    let response = tokio::time::timeout(Duration::from_secs(2), async {
        tokio::time::sleep(Duration::from_secs(3)).await;
        "remote response"
    })
    .await;

    assert!(response.is_err());
}
