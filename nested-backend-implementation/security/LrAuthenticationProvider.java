package com.bistech.reporting.security;

import com.bistech.reporting.dto.auth.LdapAuthResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Collections;
import java.util.Map;

/// Pure LDAP authentication against the HTTP bridge. Nothing else: user
/// synchronization moved to AuthService, so a login that later fails the
/// CAPTCHA never touches the database.
@Component
public class LrAuthenticationProvider implements AuthenticationProvider {

    private static final Logger LOGGER = LoggerFactory.getLogger(LrAuthenticationProvider.class);

    private final RestClient restClient;

    public LrAuthenticationProvider(
            final RestClient.Builder restClientBuilder,
            final @Value("${auth.ldap.url}") String ldapUrl
    ) {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();

        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofSeconds(10));

        this.restClient = restClientBuilder
                .baseUrl(ldapUrl)
                .requestFactory(requestFactory)
                .build();
    }

    @Override
    public Authentication authenticate(final Authentication authentication) throws AuthenticationException {
        String username = authentication.getName();
        Object credentials = authentication.getCredentials();

        if (username == null || username.isBlank() || credentials == null) {
            throw new BadCredentialsException("Invalid username or password");
        }

        String password = credentials.toString();

        if (password.isBlank()) {
            throw new BadCredentialsException("Invalid username or password");
        }

        LOGGER.info("Trying to authenticate user: {}", username);

        try {
            Map<String, String> requestBody = Map.of(
                    "userName", username,
                    "password", password
            );

            LdapAuthResponse ldapAuthResponse = restClient.post()
                    .body(requestBody)
                    .retrieve()
                    .body(LdapAuthResponse.class);

            if (ldapAuthResponse == null) {
                LOGGER.error("Authentication response for user {} returned null.", username);
                throw new BadCredentialsException("Authentication response returned an empty response");
            }

            // Verified bridge contract (2026-08-14): HTTP 200 + profile JSON =
            // authenticated; bad credentials arrive as HTTP 401 (handled in
            // the catch blocks below) and never reach this point. The
            // `authenticated` field is present in the schema but always null,
            // so fail-closed here means two things instead:
            // 1. If the field ever DOES carry a value, anything but an
            //    affirmative rejects.
            if (ldapAuthResponse.authenticated() != null
                    && !"true".equalsIgnoreCase(ldapAuthResponse.authenticated())) {
                LOGGER.warn(
                        "LDAP explicitly did not affirm authentication for user '{}' (authenticated={})",
                        username,
                        ldapAuthResponse.authenticated()
                );
                throw new BadCredentialsException("Invalid username or password");
            }

            // 2. A 200 without the identity we need to build a session is a
            //    broken contract, not a login — surface as a service error
            //    (503), never as a half-authenticated session.
            if (ldapAuthResponse.username() == null || ldapAuthResponse.username().isBlank()
                    || ldapAuthResponse.employeeId() == null || ldapAuthResponse.employeeId().isBlank()) {
                LOGGER.error("LDAP 200 response is missing identity fields for user '{}'", username);
                throw new AuthenticationServiceException("LDAP returned incomplete user data");
            }

            LOGGER.info("User '{}' authenticated successfully from LDAP.", username);

            UsernamePasswordAuthenticationToken authenticationToken =
                    new UsernamePasswordAuthenticationToken(
                            ldapAuthResponse.username(),
                            null,
                            Collections.emptyList()
                    );

            authenticationToken.setDetails(ldapAuthResponse);
            return authenticationToken;

        } catch (BadCredentialsException e) {
            throw e;

        } catch (HttpClientErrorException.Unauthorized e) {
            LOGGER.warn("Invalid credentials for user: {}", username);
            throw new BadCredentialsException("Invalid username or password");

        } catch (HttpClientErrorException.NotFound e) {
            LOGGER.error("User '{}' not found.", username);
            throw new BadCredentialsException("Invalid username or password");

        } catch (HttpServerErrorException.GatewayTimeout e) {
            LOGGER.error("LDAP timed out while authenticating user: {}", username);
            throw new AuthenticationServiceException("LDAP timed out", e);

        } catch (HttpServerErrorException e) {
            LOGGER.error("LDAP server error while authenticating user '{}': {}", username, e.getStatusCode());
            throw new AuthenticationServiceException("LDAP service error", e);

        } catch (HttpStatusCodeException e) {
            LOGGER.error("LDAP returned unexpected status while authenticating user '{}': {}", username, e.getStatusCode());
            throw new AuthenticationServiceException("LDAP service returned an unexpected response", e);

        } catch (ResourceAccessException e) {
            LOGGER.error("LDAP is not reachable while authenticating user '{}': {}", username, e.getMessage());
            throw new AuthenticationServiceException("LDAP service is not reachable", e);

        } catch (RestClientException e) {
            LOGGER.error("LDAP request failed while authenticating user '{}': {}", username, e.getMessage());
            throw new AuthenticationServiceException("LDAP request failed", e);

        } catch (Exception e) {
            LOGGER.error("An unexpected error occurred during authentication for user: {}", username, e);
            throw new AuthenticationServiceException("Authentication failed due to external service error", e);
        }
    }

    @Override
    public boolean supports(final Class<?> authentication) {
        return UsernamePasswordAuthenticationToken.class.isAssignableFrom(authentication);
    }
}
