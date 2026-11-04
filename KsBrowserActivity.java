package ks.browser;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.IDN;
import java.net.URL;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/* KS · In-app private browser.
   Every host the page wants to load is first looked up through AdGuard DNS over HTTPS (DoH).
   If AdGuard blocks it (ads, trackers, malware; adult sites in Family mode) the request is cancelled. */
public class KsBrowserActivity extends Activity {

  private static class Entry { boolean blocked; long exp; Entry(boolean b, long e) { blocked = b; exp = e; } }

  private WebView web;
  private EditText urlBox;
  private ProgressBar bar;
  private TextView shield;
  private Button back, fwd;
  private String dnsHost = "";
  private final AtomicInteger blockedCount = new AtomicInteger();
  private final ConcurrentHashMap<String, Entry> cache = new ConcurrentHashMap<>();

  private int dp(int v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

  private Button tool(String t) {
    Button b = new Button(this);
    b.setText(t); b.setAllCaps(false); b.setTextSize(16); b.setTextColor(Color.parseColor("#3b2bb5"));
    b.setBackgroundColor(Color.TRANSPARENT); b.setPadding(0, 0, 0, 0);
    b.setLayoutParams(new LinearLayout.LayoutParams(dp(40), dp(44)));
    return b;
  }

  @Override protected void onCreate(Bundle s) {
    super.onCreate(s);
    String start = getIntent().getStringExtra("url");
    dnsHost = getIntent().getStringExtra("dns");
    if (dnsHost == null) dnsHost = "";
    dnsHost = dnsHost.trim().toLowerCase();
    if (start == null || start.isEmpty()) start = "https://duckduckgo.com";

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.WHITE);
    root.setFitsSystemWindows(true);

    LinearLayout top = new LinearLayout(this);
    top.setOrientation(LinearLayout.HORIZONTAL);
    top.setGravity(Gravity.CENTER_VERTICAL);
    top.setPadding(dp(4), dp(2), dp(4), dp(2));
    top.setBackgroundColor(Color.parseColor("#f4f3fb"));
    back = tool("◀"); fwd = tool("▶");
    Button reload = tool("⟳"), close = tool("✕");
    urlBox = new EditText(this);
    urlBox.setSingleLine(true); urlBox.setTextSize(14); urlBox.setHint("Search or type a link");
    urlBox.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
    urlBox.setImeOptions(EditorInfo.IME_ACTION_GO);
    urlBox.setBackgroundColor(Color.WHITE); urlBox.setPadding(dp(12), 0, dp(12), 0);
    urlBox.setLayoutParams(new LinearLayout.LayoutParams(0, dp(40), 1f));
    top.addView(back); top.addView(fwd); top.addView(urlBox); top.addView(reload); top.addView(close);

    bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
    bar.setMax(100); bar.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

    web = new WebView(this);
    web.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

    shield = new TextView(this);
    shield.setTextSize(12); shield.setTextColor(Color.parseColor("#3b2bb5")); shield.setGravity(Gravity.CENTER);
    shield.setBackgroundColor(Color.parseColor("#f4f3fb")); shield.setPadding(0, dp(6), 0, dp(6));
    updateShield();

    root.addView(top); root.addView(bar); root.addView(web); root.addView(shield);
    setContentView(root);

    WebSettings w = web.getSettings();
    w.setJavaScriptEnabled(true); w.setDomStorageEnabled(true);
    w.setAllowFileAccess(false); w.setAllowContentAccess(false);
    w.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    w.setSupportZoom(true); w.setBuiltInZoomControls(true); w.setDisplayZoomControls(false);
    w.setLoadWithOverviewMode(true); w.setUseWideViewPort(true);

    web.setWebChromeClient(new WebChromeClient() {
      @Override public void onProgressChanged(WebView v, int p) {
        bar.setProgress(p); bar.setVisibility(p >= 100 ? View.GONE : View.VISIBLE);
      }
    });
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl(); String sc = u.getScheme() == null ? "" : u.getScheme();
        if (sc.equals("http") || sc.equals("https")) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { }
        return true;
      }
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        String host = r.getUrl().getHost();
        if (host != null && isBlocked(host)) {
          blockedCount.incrementAndGet();
          runOnUiThread(KsBrowserActivity.this::updateShield);
          if (r.isForMainFrame()) {
            String html = "<html><body style='font-family:sans-serif;text-align:center;padding:48px 20px;color:#333'>"
              + "<div style='font-size:54px'>🛡️</div><h2>Blocked by AdGuard DNS</h2><p>" + host
              + "</p><p style='color:#777'>This site is blocked (ads, tracker, malware or filtered category) or does not exist.</p></body></html>";
            return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(html.getBytes()));
          }
          return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
        }
        return null;
      }
      @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap f) { if (!urlBox.hasFocus()) urlBox.setText(url); nav(); }
      @Override public void onPageFinished(WebView v, String url) { if (!urlBox.hasFocus()) urlBox.setText(url); nav(); }
    });
    web.setDownloadListener((u, ua, cd, mime, len) -> { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u))); } catch (Exception e) { } });

    back.setOnClickListener(v -> { if (web.canGoBack()) web.goBack(); });
    fwd.setOnClickListener(v -> { if (web.canGoForward()) web.goForward(); });
    reload.setOnClickListener(v -> web.reload());
    close.setOnClickListener(v -> finish());
    urlBox.setOnEditorActionListener((v, id, ev) -> {
      if (id == EditorInfo.IME_ACTION_GO || (ev != null && ev.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
        web.loadUrl(target(urlBox.getText().toString())); urlBox.clearFocus(); web.requestFocus();
        InputMethodManager im = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (im != null) im.hideSoftInputFromWindow(urlBox.getWindowToken(), 0);
        return true;
      }
      return false;
    });
    web.loadUrl(target(start));
  }

  private void nav() { back.setAlpha(web.canGoBack() ? 1f : .35f); fwd.setAlpha(web.canGoForward() ? 1f : .35f); }

  private void updateShield() {
    shield.setText(dnsHost.isEmpty() ? "DNS filter is OFF" : "🛡 " + dnsHost + " · " + blockedCount.get() + " blocked");
  }

  private String target(String q) {
    q = q == null ? "" : q.trim();
    if (q.isEmpty()) return "https://duckduckgo.com";
    if (q.matches("(?i)^https?://\\S+$")) return q;
    if (!q.contains(" ") && q.contains(".")) return "https://" + q;
    return "https://duckduckgo.com/?q=" + Uri.encode(q);
  }

  @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else finish(); }
  @Override protected void onDestroy() { try { web.destroy(); } catch (Exception e) { } super.onDestroy(); }

  /* ---------- AdGuard DNS over HTTPS (RFC 8484) ---------- */
  private boolean isBlocked(String host) {
    if (dnsHost.isEmpty()) return false;
    host = host.toLowerCase();
    if (host.equals("localhost") || host.equals(dnsHost) || host.contains(":") || host.matches("[0-9.]+")) return false;
    long now = System.currentTimeMillis();
    Entry e = cache.get(host);
    if (e != null && e.exp > now) return e.blocked;
    boolean b = false;
    try { b = lookup(host); } catch (Exception ex) { b = false; }   // if the DNS server cannot be reached the page still loads
    cache.put(host, new Entry(b, now + 10 * 60 * 1000L));
    return b;
  }

  private boolean lookup(String host) throws Exception {
    ByteArrayOutputStream q = new ByteArrayOutputStream();
    q.write(0); q.write(0); q.write(1); q.write(0);          // id, flags (recursion desired)
    q.write(0); q.write(1); q.write(0); q.write(0); q.write(0); q.write(0); q.write(0); q.write(0);
    for (String lab : IDN.toASCII(host).split("\\.")) { byte[] lb = lab.getBytes("US-ASCII"); q.write(lb.length); q.write(lb); }
    q.write(0); q.write(0); q.write(1); q.write(0); q.write(1);   // type A, class IN
    String b64 = Base64.encodeToString(q.toByteArray(), Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    HttpURLConnection c = (HttpURLConnection) new URL("https://" + dnsHost + "/dns-query?dns=" + b64).openConnection();
    c.setConnectTimeout(4000); c.setReadTimeout(4000);
    c.setRequestProperty("Accept", "application/dns-message");
    if (c.getResponseCode() != 200) return false;
    InputStream in = c.getInputStream();
    ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] buf = new byte[1024]; int n;
    while ((n = in.read(buf)) > 0 && o.size() < 8192) o.write(buf, 0, n);
    in.close();
    byte[] r = o.toByteArray();
    if (r.length < 12) return false;
    int rcode = r[3] & 0x0F;
    if (rcode == 3 || rcode == 5) return true;                 // NXDOMAIN / REFUSED = blocked
    int qd = ((r[4] & 0xFF) << 8) | (r[5] & 0xFF), an = ((r[6] & 0xFF) << 8) | (r[7] & 0xFF), p = 12;
    for (int i = 0; i < qd; i++) { p = skip(r, p) + 4; }
    for (int i = 0; i < an; i++) {
      p = skip(r, p);
      if (p + 10 > r.length) break;
      int type = ((r[p] & 0xFF) << 8) | (r[p + 1] & 0xFF), len = ((r[p + 8] & 0xFF) << 8) | (r[p + 9] & 0xFF);
      p += 10;
      if (type == 1 && len == 4 && p + 4 <= r.length && r[p] == 0 && r[p + 1] == 0 && r[p + 2] == 0 && r[p + 3] == 0) return true;   // 0.0.0.0 = blocked
      p += len;
    }
    return false;
  }

  private int skip(byte[] r, int p) {
    while (p < r.length) {
      int b = r[p] & 0xFF;
      if (b == 0) return p + 1;
      if ((b & 0xC0) == 0xC0) return p + 2;
      p += b + 1;
    }
    return p;
  }
}
