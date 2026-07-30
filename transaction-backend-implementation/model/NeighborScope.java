package com.bistech.reporting.model.transaction;

/**
 * Which concurrency domain the neighbor comparison runs in:
 * ME = same matching-engine partition, windowed on me_net_input_time;
 * GW = same (node, process, partition), windowed on gw_net_input_time.
 */
public enum NeighborScope {
    ME,
    GW
}
