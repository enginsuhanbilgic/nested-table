package com.bistech.reporting.repository.user;

import com.bistech.reporting.model.user.RoleCnRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface RoleCnRuleRepository extends JpaRepository<RoleCnRule, Long> {

    @Query("select r from RoleCnRule r join fetch r.role where r.active = true")
    List<RoleCnRule> findAllActiveWithRole();

    @Query("select r from RoleCnRule r join fetch r.role order by r.role.code, r.cnValue")
    List<RoleCnRule> findAllWithRole();

    List<RoleCnRule> findByRoleId(Long roleId);
}
