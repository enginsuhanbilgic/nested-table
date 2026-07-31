package com.borsaistanbul.reporting.security;

import com.borsaistanbul.reporting.dto.LdapAuthResponse;
import com.borsaistanbul.reporting.service.UserService;
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
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Collections;
import java.util.Map;

@Component
public class LrAuthenticationProvider implements AuthenticationProvider {

    private static final Logger LOGGER = LoggerFactory.getLogger(LrAuthenticationProvider.class);

    private final RestClient restClient;
    private final UserService userService;

    public LrAuthenticationProvider(
            final RestClient.Builder restClientBuilder,
            final UserService userService,
            final @Value("${auth.ldap.url}") String ldapUrl
    ) {
        this.userService = userService;

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

            LdapAuthResponse ldapAuthResponse;

            ldapAuthResponse = restClient.post()
                    .body(requestBody)
                    .retrieve()
                    .body(LdapAuthResponse.class);

            if (ldapAuthResponse == null) {
                LOGGER.error("Authentication response for user {} returned null.", username);
                throw new BadCredentialsException("Authentication response returned an empty response");
            }

            if ("false".equalsIgnoreCase(ldapAuthResponse.authenticated())) {
                LOGGER.warn("LDAP returned authenticated=false for user: {}", username);
                throw new BadCredentialsException("Invalid username or password");
            }

            LOGGER.info("User '{}' authenticated successfully from LDAP. Synchronizing user data.", username);
            userService.synchronizeUser(ldapAuthResponse);

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

        } catch (IllegalArgumentException e) {
            LOGGER.error("LDAP returned incomplete user data for '{}': {}", username, e.getMessage());
            throw new AuthenticationServiceException("LDAP returned incomplete user data", e);

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
