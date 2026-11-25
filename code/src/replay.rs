use std::cmp::{Ordering, Reverse};
use std::collections::{BinaryHeap, HashSet};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReplayClock {
    now_ns: u64,
}

impl ReplayClock {
    pub const fn new() -> Self {
        Self { now_ns: 0 }
    }

    pub const fn now_ns(self) -> u64 {
        self.now_ns
    }
}

impl Default for ReplayClock {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct ScheduledEvent<T> {
    pub at_ns: u64,
    pub priority: u8,
    /// Stable sequence assigned by the source event log, not by insertion order.
    pub local_sequence: u64,
    pub payload: T,
}

impl<T> PartialEq for ScheduledEvent<T> {
    fn eq(&self, other: &Self) -> bool {
        (self.at_ns, self.priority, self.local_sequence)
            == (other.at_ns, other.priority, other.local_sequence)
    }
}

impl<T> Eq for ScheduledEvent<T> {}

impl<T> Ord for ScheduledEvent<T> {
    fn cmp(&self, other: &Self) -> Ordering {
        (self.at_ns, self.priority, self.local_sequence).cmp(&(
            other.at_ns,
            other.priority,
            other.local_sequence,
        ))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReplayError {
    EventInPast {
        at_ns: u64,
        now_ns: u64,
    },
    DuplicateKey {
        at_ns: u64,
        priority: u8,
        local_sequence: u64,
    },
}

impl fmt::Display for ReplayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EventInPast { at_ns, now_ns } => {
                write!(
                    f,
                    "cannot schedule event at {at_ns} behind replay clock {now_ns}"
                )
            }
            Self::DuplicateKey {
                at_ns,
                priority,
                local_sequence,
            } => write!(
                f,
                "duplicate replay key: time={at_ns}, priority={priority}, local_sequence={local_sequence}"
            ),
        }
    }
}

impl std::error::Error for ReplayError {}

impl<T> PartialOrd for ScheduledEvent<T> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Debug)]
pub struct Replay<T> {
    clock: ReplayClock,
    events: BinaryHeap<Reverse<ScheduledEvent<T>>>,
    seen_keys: HashSet<(u64, u8, u64)>,
}

impl<T> Default for Replay<T> {
    fn default() -> Self {
        Self {
            clock: ReplayClock::new(),
            events: BinaryHeap::new(),
            seen_keys: HashSet::new(),
        }
    }
}

impl<T> Replay<T> {
    pub fn schedule(
        &mut self,
        at_ns: u64,
        priority: u8,
        local_sequence: u64,
        payload: T,
    ) -> Result<(), ReplayError> {
        if at_ns < self.clock.now_ns {
            return Err(ReplayError::EventInPast {
                at_ns,
                now_ns: self.clock.now_ns,
            });
        }
        let key = (at_ns, priority, local_sequence);
        if !self.seen_keys.insert(key) {
            return Err(ReplayError::DuplicateKey {
                at_ns,
                priority,
                local_sequence,
            });
        }
        let event = ScheduledEvent {
            at_ns,
            priority,
            local_sequence,
            payload,
        };
        self.events.push(Reverse(event));
        Ok(())
    }

    pub fn next_event(&mut self) -> Option<ScheduledEvent<T>> {
        let Reverse(event) = self.events.pop()?;
        assert!(
            event.at_ns >= self.clock.now_ns,
            "event time moved backwards"
        );
        self.clock.now_ns = event.at_ns;
        Some(event)
    }

    pub const fn clock(&self) -> ReplayClock {
        self.clock
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orders_by_time_priority_then_local_sequence() {
        let mut replay = Replay::default();
        replay.schedule(20, 1, 0, "late").unwrap();
        replay.schedule(10, 2, 0, "normal").unwrap();
        replay.schedule(10, 1, 0, "risk").unwrap();

        assert_eq!(replay.next_event().unwrap().payload, "risk");
        assert_eq!(replay.next_event().unwrap().payload, "normal");
        assert_eq!(replay.next_event().unwrap().payload, "late");
        assert_eq!(replay.clock().now_ns(), 20);
    }

    #[test]
    fn shuffled_insertion_has_the_same_order() {
        fn run(events: &[(u64, u8, u64, &'static str)]) -> Vec<&'static str> {
            let mut replay = Replay::default();
            for &(at_ns, priority, local_sequence, payload) in events {
                replay
                    .schedule(at_ns, priority, local_sequence, payload)
                    .unwrap();
            }
            std::iter::from_fn(|| replay.next_event())
                .map(|event| event.payload)
                .collect()
        }

        let events = [
            (10, 1, 2, "market-b"),
            (10, 1, 1, "market-a"),
            (10, 2, 0, "timer"),
        ];
        let shuffled = [events[2], events[0], events[1]];
        assert_eq!(run(&events), run(&shuffled));
        assert_eq!(run(&events), ["market-a", "market-b", "timer"]);
    }

    #[test]
    fn rejects_duplicate_keys() {
        let mut replay = Replay::default();
        replay.schedule(10, 1, 7, "first").unwrap();
        assert_eq!(replay.next_event().unwrap().payload, "first");
        assert_eq!(
            replay.schedule(10, 1, 7, "duplicate"),
            Err(ReplayError::DuplicateKey {
                at_ns: 10,
                priority: 1,
                local_sequence: 7,
            })
        );
    }

    #[test]
    fn rejects_events_behind_the_replay_clock() {
        let mut replay = Replay::default();
        replay.schedule(10, 1, 1, "first").unwrap();
        replay.next_event().unwrap();

        assert_eq!(
            replay.schedule(9, 1, 2, "past"),
            Err(ReplayError::EventInPast {
                at_ns: 9,
                now_ns: 10,
            })
        );
    }
}
