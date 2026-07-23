// PROPOSED ADDITION — not yet in the real backend.
//
// Serves the RTT histogram bucket boundaries so the frontend no longer
// hardcodes what range1..range36 mean. Consumed by
// latencyService.getRttBucketRanges() via GET /api/latency/types/rtt/ranges
// (the frontend falls back to a built-in ladder if this endpoint is missing).
//
// index is 1-based and matches the range{index} column of the RTT stats
// response; toMicros == null marks the open-ended last bucket.

public record RttBucketRangeResponse(
        int index,
        long fromMicros,
        Long toMicros // null => open-ended last bucket
) {

    // The endpoint belongs in LatencyGeneralStatsController next to the
    // other /types handlers:
    //
    //     @GetMapping("/types/rtt/ranges")
    //     public ResponseEntity<List<RttBucketRangeResponse>> getRttBucketRanges() {
    //         return ResponseEntity.ok(rttRangeService.getBucketRanges());
    //     }
    //
    // And in RttRangeService (static definition; replace with the pipeline's
    // own bucket table if one exists, so the ladder can never drift from the
    // ETL that fills range1..range36):
    //
    //     public List<RttBucketRangeResponse> getBucketRanges() {
    //         final List<Long> edges = new ArrayList<>();
    //         for (long v = 0; v <= 100; v += 10) edges.add(v);          // 10µs steps
    //         for (long v = 125; v <= 300; v += 25) edges.add(v);        // 25µs steps
    //         for (long v = 400; v <= 800; v += 100) edges.add(v);       // 100µs steps
    //         edges.add(1_200L);
    //         for (long v = 2_400; v <= 2_457_600; v *= 2) edges.add(v); // doubling
    //
    //         final List<RttBucketRangeResponse> ranges = new ArrayList<>();
    //         for (int i = 0; i < edges.size(); i++) {
    //             ranges.add(new RttBucketRangeResponse(
    //                     i + 1,
    //                     edges.get(i),
    //                     i + 1 < edges.size() ? edges.get(i + 1) : null
    //             ));
    //         }
    //         return ranges; // 36 entries
    //     }
}
