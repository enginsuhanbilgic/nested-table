package com.borsaistanbul.reporting.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;

@Configuration
public class SecurityContextRepositoryConfig {

    @Bean
    public RequestAttributeSecurityContextRepository requestAttributeSecurityContextRepository() {
        return new RequestAttributeSecurityContextRepository();
    }
}
