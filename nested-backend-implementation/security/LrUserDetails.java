package com.borsaistanbul.reporting.security;

import com.borsaistanbul.reporting.model.user.Role;
import com.borsaistanbul.reporting.model.user.User;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.stream.Collectors;

public class LrUserDetails implements UserDetails {

    @Getter
    public User user;

    private final String username;
    private final Collection<? extends GrantedAuthority> authorities;

    public LrUserDetails(final User userSent) {
        user = userSent;
        username = userSent.getUsername();
        authorities = userSent.getRoles().stream()
                .map((Role role) -> new SimpleGrantedAuthority("ROLE_" + role.name()))
                .collect(Collectors.toList());
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getPassword() {
        return null;
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}