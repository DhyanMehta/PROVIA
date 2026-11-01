const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

// Health Connect's system rationale must be readable even while signed out.
module.exports = function withHealthPrivacy(config) {
  config = withAndroidManifest(config, result => {
    const app = result.modResults.manifest.application[0];
    const action = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';
    for (const activity of app.activity ?? []) {
      activity['intent-filter'] = (activity['intent-filter'] ?? []).filter(filter =>
        !(filter.action ?? []).some(item => item.$['android:name'] === action));
    }
    app.activity = (app.activity ?? []).filter(item => item.$['android:name'] !== '.HealthPrivacyActivity');
    app.activity.push({ $: { 'android:name': '.HealthPrivacyActivity', 'android:exported': 'true' },
      'intent-filter': [{ action: [{ $: { 'android:name': action } }] }] });
    for (const alias of app['activity-alias'] ?? []) {
      if (alias.$['android:name'] === 'ViewPermissionUsageActivity') alias.$['android:targetActivity'] = '.HealthPrivacyActivity';
    }
    return result;
  });
  return withDangerousMod(config, ['android', async result => {
    const dir = path.join(result.modRequest.platformProjectRoot, 'app/src/main/java/com/provia/app');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'HealthPrivacyActivity.java'), `package com.provia.app;
public final class HealthPrivacyActivity extends android.app.Activity {
  @Override public void onCreate(android.os.Bundle state) {
    super.onCreate(state);
    android.widget.ScrollView scroll = new android.widget.ScrollView(this);
    scroll.setFitsSystemWindows(true);
    android.widget.TextView text = new android.widget.TextView(this);
    text.setTextSize(18);
    int pad = (int)(24 * getResources().getDisplayMetrics().density);
    text.setPadding(pad, pad, pad, pad);
    text.setText("PROVIA Health Connect privacy\\n\\nPROVIA requests read-only Steps, Weight and Sleep access only when you select those categories. It does not write to Health Connect or read in the background.\\n\\nSync is manual. Supported records are sent to your signed-in PROVIA account over HTTPS, and server-confirmed records appear in tracking. Missing readings are not treated as zero. Goals do not change automatically.\\n\\nImport identity and sync metadata are stored in Android SecureStore for your PROVIA account. Health records are not included in ordinary application diagnostics.\\n\\nYou can manage or revoke permissions in Health Connect. Revocation stops future reads but does not delete records already saved to PROVIA. Review or delete saved records in the appropriate tracking screen. Do not import another person's device history.");
    scroll.addView(text); setContentView(scroll);
  }
}
`);
    return result;
  }]);
};
