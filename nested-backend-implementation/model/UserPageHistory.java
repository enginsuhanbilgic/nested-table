import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "user_page_history", schema = "stat")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserPageHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(
            name = "id",
            nullable = false,
            updatable = false
    )
    private Long id;

    @ManyToOne(
            fetch = FetchType.LAZY,
            optional = false
    )
    @JoinColumn(
            name = "user_id",
            nullable = false,
            foreignKey = @ForeignKey(name = "fk_user_page_history_user")
    )
    private User user;

    @Column(name = "page_path", nullable = false, length = 255)
    private String pagePath;

    @Column(name = "page_title", length = 255)
    private String pageTitle;

    @Column(name = "visit_timestamp", nullable = false)
    private Instant visitTimestamp;

    @Column(name = "referrer", columnDefinition = "text")
    private String referrer;

    @Column(name = "user_agent", length = 255)
    private String userAgent;

    @PrePersist
    protected void onCreate() {
        if (this.visitTimestamp == null) {
            this.visitTimestamp = Instant.now();
        }
    }
}
