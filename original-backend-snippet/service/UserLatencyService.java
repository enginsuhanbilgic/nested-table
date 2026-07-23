package com.bistech.reporting.service;

import com.bistech.reporting.dto.latency.UserLatencyFilterRequest;
import com.bistech.reporting.dto.latency.UserLatencyResponse;
import com.bistech.reporting.model.latency.UserLatency;
import com.bistech.reporting.repository.latency.UserLatencyRepository;
import com.bistech.reporting.repository.latency.UserLatencySpecs;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class UserLatencyService {

    private static final Logger LOGGER =
            LoggerFactory.getLogger(UserLatencyService.class);

    private final UserLatencyRepository userLatencyRepository;

    public Page<UserLatencyResponse> getUserLatencyStats(
            final UserLatencyFilterRequest filterRequest,
            final Pageable pageable
    ) {
        UserLatencyFilterRequest normalizedRequest =
                Objects.requireNonNullElseGet(
                        filterRequest,
                        () -> new UserLatencyFilterRequest(
                                null,
                                null,
                                null,
                                null,
                                null
                        )
                ).normalized();

        Specification<UserLatency> spec =
                Specification.<UserLatency>unrestricted()
                        .and(UserLatencySpecs.dateEquals(
                                normalizedRequest.date()
                        ))
                        .and(UserLatencySpecs.queryStringContains(
                                normalizedRequest.queryString()
                        ))
                        .and(UserLatencySpecs.locationContains(
                                normalizedRequest.locations()
                        ))
                        .and(UserLatencySpecs.partitionContains(
                                normalizedRequest.partitions()
                        ))
                        .and(UserLatencySpecs.protocolContains(
                                normalizedRequest.protocols()
                        ));

        Page<UserLatency> rawDataPage =
                userLatencyRepository.findAll(spec, pageable);

        Long offset = pageable.getOffset();
        List<UserLatencyResponse> responses = new ArrayList<>();

        for (int i = 0; i < rawDataPage.getContent().size(); i++) {
            UserLatency entity = rawDataPage.getContent().get(i);

            responses.add(new UserLatencyResponse(
                    offset + i + 1,
                    entity.getDate(),
                    entity.getNode(),
                    entity.getParticipantName(),
                    entity.getNoParticipant(),
                    entity.getUsername(),
                    entity.getPartition(),
                    entity.getProcess(),
                    entity.getLocation(),
                    entity.getProtocol(),
                    entity.getNoUser(),
                    entity.getNoOrd(),
                    entity.getNoOrdInVolatile(),
                    entity.getRatio(),
                    entity.getGwMed(),
                    entity.getGwAvg(),
                    entity.getGwMin(),
                    entity.getGwMax(),
                    entity.getMeMed(),
                    entity.getMeAvg(),
                    entity.getMeMin(),
                    entity.getMeMax()
            ));
        }

        return new PageImpl<>(
                responses,
                pageable,
                rawDataPage.getTotalElements()
        );
    }
}
