package com.bistech.reporting.dto.auth;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true) // ignoring fields we don't need
public record LdapAuthResponse(

        @JsonProperty("userName")
        String username,

        @JsonProperty("fullName")
        String fullName,

        @JsonProperty("email")
        String email,

        @JsonProperty("organization")
        String organization,

        @JsonProperty("title")
        String title,

        @JsonProperty("employeeId")
        String employeeId,

        @JsonProperty("authenticated")
        String authenticated,

        @JsonProperty("dn")
        String dn,

        @JsonProperty("memberOf")
        List<String> memberOf
) {
}
