package com.bistech.reporting.service;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Drives the order-search queue. Requires @EnableScheduling. Single-threaded
 * by design: user clicks are serialized so ad-hoc searches can never stack
 * load on me_pcap; each individual search is an index probe and finishes in
 * well under a second. The claim query uses FOR UPDATE SKIP LOCKED, so
 * running multiple app instances is safe and simply adds workers.
 */
@Component
@RequiredArgsConstructor
public class OrderSearchWorker {

    private final OrderSearchJobService jobService;

    @Scheduled(fixedDelayString = "${transaction.search.poll-ms:1000}")
    public void poll() {
        // Drain the queue instead of one job per tick, so a burst of
        // searches is not throttled to one per poll interval.
        while (true) {
            Optional<Long> claimed = jobService.claimNext();
            if (claimed.isEmpty()) {
                return;
            }

            long searchId = claimed.get();
            try {
                jobService.execute(searchId);
            } catch (Exception e) {
                jobService.markFailed(searchId, e);
            }
        }
    }

    @Scheduled(fixedDelayString = "${transaction.search.stale-check-ms:60000}")
    public void requeueStale() {
        jobService.requeueStale();
    }
}
