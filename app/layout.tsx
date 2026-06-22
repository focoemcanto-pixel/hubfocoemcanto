import './globals.css';
import './premium-ui.css';
import './course-ui.css';
import './lesson-premium.css';
import './activity-premium.css';
import './hub-premium-overrides.css';
import './admin-module-premium.css';
import './admin-live-cover.css';
import './activity-mobile-fixes.css';
import './community-premium.css';
import './instagram-feed.css';
import './community-fixes.css';
import './activity-audio-controls.css';
import './profile-premium.css';
import './admin-reviews-premium.css';
import './admin-premium.css';
import './instagram-performance.css';
import './social-profile.css';
import './edit-profile.css';
import './student-reviews.css';
import './notifications-premium.css';
import './community-publish-menu.css';

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{props.children}</body>
    </html>
  );
}
