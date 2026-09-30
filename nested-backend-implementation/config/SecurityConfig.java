package com.bistech.reporting.config;

import com.bistech.reporting.security.JwtRequestFilter;
import com.bistech.reporting.security.LrAccessDeniedHandler;
import com.bistech.reporting.security.LrAuthenticationEntryPoint;
import com.bistech.reporting.security.LrAuthenticationProvider;
import com.bistech.reporting.security.PageCodes;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;

/// Stateless JWT security. Enforcement model (plan §4.2):
///  - /api/admin/**            → the ADMIN role (never the editable mapping,
///                               so admins can't lock admins out)
///  - business endpoints       → the PAGE_* authority of the page they serve;
///                               admin tokens carry every page, so no OR-ADMIN
///                               is needed here
///  - page tracking WRITE      → any authenticated user (every browser posts it)
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtRequestFilter jwtRequestFilter;
    private final LrAuthenticationEntryPoint lrAuthenticationEntryPoint;
    private final LrAccessDeniedHandler lrAccessDeniedHandler;

    @Value("${app.cors.allowed-origins}")
    private String[] corsAllowedOrigins;

    @Bean
    public AuthenticationManager authenticationManager(final LrAuthenticationProvider provider) {
        return new ProviderManager(provider);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(final HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(AbstractHttpConfigurer::disable)
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(lrAuthenticationEntryPoint)
                        .accessDeniedHandler(lrAccessDeniedHandler))
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/api/auth/login",
                                "/api/auth/refresh",
                                "/api/auth/logout").permitAll()
                        .requestMatchers("/api/captcha/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()

                        .requestMatchers("/api/admin/**").hasRole("ADMIN")

                        .requestMatchers("/api/transaction/**")
                        .hasAuthority(PageCodes.authority(PageCodes.TRANSACTIONS))

                        // PageTracker posts a visit log from EVERY page for
                        // EVERY user; only reading the analytics is gated.
                        .requestMatchers(HttpMethod.POST, "/api/audit/pagehistory/log").authenticated()
                        .requestMatchers("/api/audit/pagehistory/**")
                        .hasAuthority(PageCodes.authority(PageCodes.ANALYTICS))

                        .requestMatchers("/api/latency/nested/**")
                        .hasAuthority(PageCodes.authority(PageCodes.LATENCY_GROUPED))

                        .requestMatchers("/api/latency/getRttRangeStats", "/api/latency/types/rtt/**")
                        .hasAuthority(PageCodes.authority(PageCodes.LATENCY_RTT))

                        .requestMatchers(
                                "/api/latency/getLatencyDailyAverageStats",
                                "/api/latency/getLatencyMinuteStats")
                        .hasAuthority(PageCodes.authority(PageCodes.LATENCY_DAILY))

                        // Shared latency helpers (/api/latency/types/** filter
                        // options, user stats): any latency page will do.
                        .requestMatchers("/api/latency/**")
                        .hasAnyAuthority(
                                PageCodes.authority(PageCodes.LATENCY_DAILY),
                                PageCodes.authority(PageCodes.LATENCY_RTT),
                                PageCodes.authority(PageCodes.LATENCY_GROUPED))

                        .anyRequest().authenticated())
                .addFilterBefore(jwtRequestFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        configuration.setAllowedOrigins(Arrays.asList(corsAllowedOrigins));
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        configuration.setAllowedHeaders(Arrays.asList("Authorization", "Content-Type"));
        configuration.setExposedHeaders(Arrays.asList("Content-Disposition"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);

        return source;
    }
}
