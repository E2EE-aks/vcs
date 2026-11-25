package ks.geo;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Scanner;
import java.util.TimeZone;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/* Geo-fence attendance that works WITHOUT opening the app.
   - The app hands over the office position, the radius and the login it already has with set().
   - Android's proximity alert (LocationManager) wakes GeoReceiver when the phone gets inside the circle,
     and a 15-minute check does the same if the phone was already inside when the alert was set.
   - GeoReceiver asks the server (action geoMark) to mark today as Present, and shows "Present marked by geo fencing 🎉".
   - The server checks the distance again and only fills a day that is still empty. */
@CapacitorPlugin(name = "KsGeo", permissions = {
  @Permission(alias = "loc", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
  @Permission(alias = "bg", strings = { "android.permission.ACCESS_BACKGROUND_LOCATION" })
})
public class KsGeoPlugin extends Plugin {
  static final String PREFS = "ks_geo";
  static final String CH = "geo_att";
  static final String ACT_FENCE = "ks.geo.FENCE";
  static final String ACT_CHECK = "ks.geo.CHECK";

  static int flags(boolean mutable) {
    int f = PendingIntent.FLAG_UPDATE_CURRENT;
    if (mutable) { if (Build.VERSION.SDK_INT >= 31) f |= PendingIntent.FLAG_MUTABLE; }
    else if (Build.VERSION.SDK_INT >= 23) f |= PendingIntent.FLAG_IMMUTABLE;
    return f;
  }

  static boolean hasLoc(Context c) {
    return c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
  }

  static boolean hasBg(Context c) {
    if (Build.VERSION.SDK_INT < 29) return true;
    return c.checkSelfPermission("android.permission.ACCESS_BACKGROUND_LOCATION") == PackageManager.PERMISSION_GRANTED;
  }

  static String today() {
    SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
    f.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
    return f.format(new Date());
  }

  static PendingIntent fenceIntent(Context c) {
    Intent i = new Intent(c, GeoReceiver.class).setAction(ACT_FENCE);
    return PendingIntent.getBroadcast(c, 7301, i, flags(true));
  }

  static PendingIntent checkIntent(Context c) {
    Intent i = new Intent(c, GeoReceiver.class).setAction(ACT_CHECK);
    return PendingIntent.getBroadcast(c, 7302, i, flags(false));
  }

  static void stop(Context c) {
    try {
      LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
      lm.removeProximityAlert(fenceIntent(c));
    } catch (Exception e) {}
    try {
      AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
      am.cancel(checkIntent(c));
    } catch (Exception e) {}
  }

  static void start(Context c) {
    stop(c);
    SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    if (!sp.getBoolean("on", false) || !hasLoc(c)) return;
    try {
      double lat = Double.longBitsToDouble(sp.getLong("lat", 0));
      double lng = Double.longBitsToDouble(sp.getLong("lng", 0));
      float rad = sp.getFloat("radius", 1000f);
      LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
      lm.addProximityAlert(lat, lng, rad, -1, fenceIntent(c));
    } catch (Exception e) {}
    scheduleCheck(c, 60000L);
  }

  /* next look at the phone's position (a one-shot alarm that is allowed to run in Doze; every check sets the next one) */
  static void scheduleCheck(Context c, long delayMs) {
    try {
      AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
      long at = System.currentTimeMillis() + delayMs;
      if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, checkIntent(c));
      else am.set(AlarmManager.RTC_WAKEUP, at, checkIntent(c));
    } catch (Exception e) {}
  }

  @PluginMethod
  public void status(PluginCall call) {
    JSObject r = new JSObject();
    Context c = getContext();
    r.put("loc", hasLoc(c));
    r.put("bg", hasBg(c));
    SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    r.put("on", sp.getBoolean("on", false));
    r.put("doneToday", today().equals(sp.getString("done", "")));
    call.resolve(r);
  }

  /* ask for location, then (Android 10+) for "Allow all the time" */
  @PluginMethod
  public void askPermission(PluginCall call) {
    if (!hasLoc(getContext())) { requestPermissionForAliases(new String[] { "loc" }, call, "locCb"); return; }
    askBg(call);
  }

  @PermissionCallback
  private void locCb(PluginCall call) {
    if (!hasLoc(getContext())) { call.reject("Location permission denied"); return; }
    askBg(call);
  }

  private void askBg(PluginCall call) {
    if (hasBg(getContext())) { status(call); return; }
    requestPermissionForAliases(new String[] { "bg" }, call, "bgCb");
  }

  @PermissionCallback
  private void bgCb(PluginCall call) {
    status(call);
  }

  @PluginMethod
  public void set(PluginCall call) {
    try {
      Context c = getContext();
      SharedPreferences.Editor ed = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
      boolean on = call.getBoolean("on", false);
      ed.putBoolean("on", on);
      ed.putLong("lat", Double.doubleToRawLongBits(call.getDouble("lat", 0.0)));
      ed.putLong("lng", Double.doubleToRawLongBits(call.getDouble("lng", 0.0)));
      ed.putFloat("radius", call.getFloat("radius", 1000f));
      ed.putString("api", call.getString("api", ""));
      ed.putString("token", call.getString("token", ""));
      ed.putString("asUser", call.getString("asUser", ""));
      ed.putString("emp", call.getString("emp", ""));
      ed.apply();
      if (on) start(c); else stop(c);
      call.resolve();
    } catch (Exception e) {
      call.reject("Could not set the geo-fence: " + e.getMessage());
    }
  }

  static void notifyUser(Context c, int id, String title, String text) {
    try {
      NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
      Notification.Builder b;
      if (Build.VERSION.SDK_INT >= 26) {
        nm.createNotificationChannel(new NotificationChannel(CH, "Geo-fence attendance", NotificationManager.IMPORTANCE_HIGH));
        b = new Notification.Builder(c, CH);
      } else {
        b = new Notification.Builder(c);
        b.setPriority(Notification.PRIORITY_HIGH);
        b.setDefaults(Notification.DEFAULT_ALL);
      }
      int ic = c.getResources().getIdentifier("ic_stat_notify", "drawable", c.getPackageName());
      if (ic == 0) ic = c.getApplicationInfo().icon;
      b.setSmallIcon(ic);
      b.setAutoCancel(true);
      b.setContentTitle(title);
      b.setContentText(text);
      Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
      if (open != null) b.setContentIntent(PendingIntent.getActivity(c, 0, open, flags(false)));
      nm.notify(id, b.build());
    } catch (Exception e) {}
  }

  /* best position the phone already has (GPS, network or other apps' fix) no older than 20 minutes */
  static Location lastFix(Context c) {
    Location best = null;
    try {
      LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
      for (String p : lm.getProviders(true)) {
        Location l = lm.getLastKnownLocation(p);
        if (l == null) continue;
        if (System.currentTimeMillis() - l.getTime() > 20 * 60 * 1000L) continue;
        if (best == null || l.getAccuracy() < best.getAccuracy()) best = l;
      }
    } catch (SecurityException e) {}
    return best;
  }

  /* a real, new position: asks GPS / network for one fix (waits up to 12 s); falls back to the last one the phone already has */
  static Location freshFix(final Context c) {
    final Location[] got = new Location[1];
    final CountDownLatch cd = new CountDownLatch(1);
    final LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
    final LocationListener ls = new LocationListener() {
      @Override public void onLocationChanged(Location l) { if (l != null) { got[0] = l; cd.countDown(); } }
      @Override public void onStatusChanged(String p, int s, Bundle b) {}
      @Override public void onProviderEnabled(String p) {}
      @Override public void onProviderDisabled(String p) {}
    };
    try {
      boolean any = false;
      for (String p : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) {
        if (lm.isProviderEnabled(p)) { lm.requestLocationUpdates(p, 0L, 0f, ls, Looper.getMainLooper()); any = true; }
      }
      if (any) cd.await(12, TimeUnit.SECONDS);
    } catch (Exception e) {
    } finally {
      try { lm.removeUpdates(ls); } catch (Exception e) {}
    }
    return got[0] != null ? got[0] : lastFix(c);
  }

  /* inside the circle (alert) or time to look (15-minute check) */
  public static class GeoReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(final Context c, final Intent in) {
      final SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      if (!sp.getBoolean("on", false)) return;
      final boolean fence = ACT_FENCE.equals(in.getAction());
      if (!fence) scheduleCheck(c, 10 * 60 * 1000L);                // keep the 10-minute look going (also when today is already done: it just returns below)
      if (today().equals(sp.getString("done", ""))) return;
      if (fence && !in.getBooleanExtra(LocationManager.KEY_PROXIMITY_ENTERING, true)) return;   // leaving the circle: nothing to do
      final PendingResult pr = goAsync();
      new Thread(new Runnable() {
        @Override
        public void run() {
          try {
            double lat = Double.longBitsToDouble(sp.getLong("lat", 0));
            double lng = Double.longBitsToDouble(sp.getLong("lng", 0));
            float acc = 0f;
            Location l = freshFix(c);
            if (l != null) { lat = l.getLatitude(); lng = l.getLongitude(); acc = l.getAccuracy(); }
            else if (!fence) return;                       // check without any fix: wait for the next one
            if (l != null) {                               // clearly far from the office: no need to bother the server
              float[] dd = new float[1];
              Location.distanceBetween(l.getLatitude(), l.getLongitude(), Double.longBitsToDouble(sp.getLong("lat", 0)), Double.longBitsToDouble(sp.getLong("lng", 0)), dd);
              if (dd[0] - Math.min(l.getAccuracy(), 150f) > sp.getFloat("radius", 1000f)) return;
            }
            String api = sp.getString("api", ""), token = sp.getString("token", "");
            if (api.length() == 0 || token.length() == 0) return;
            JSONObject body = new JSONObject();
            body.put("action", "geoMark");
            body.put("token", token);
            String asUser = sp.getString("asUser", ""), emp = sp.getString("emp", "");
            if (asUser.length() > 0) body.put("asUser", asUser);
            if (emp.length() > 0) body.put("emp", emp);
            body.put("lat", lat);
            body.put("lng", lng);
            body.put("acc", acc);
            HttpURLConnection h = (HttpURLConnection) new URL(api).openConnection();
            h.setRequestMethod("POST");
            h.setDoOutput(true);
            h.setConnectTimeout(20000);
            h.setReadTimeout(25000);
            h.setRequestProperty("Content-Type", "text/plain;charset=utf-8");
            OutputStream os = h.getOutputStream();
            os.write(body.toString().getBytes("UTF-8"));
            os.close();
            InputStream is = h.getResponseCode() >= 400 ? h.getErrorStream() : h.getInputStream();
            String txt = "";
            if (is != null) {
              Scanner sc = new Scanner(is, "UTF-8").useDelimiter("\\A");
              txt = sc.hasNext() ? sc.next() : "";
              sc.close();
            }
            JSONObject r = new JSONObject(txt);
            if (r.optBoolean("ok")) {
              if (r.optBoolean("marked")) {
                sp.edit().putString("done", today()).apply();
                notifyUser(c, 7310, "Present marked by geo fencing 🎉", "You are at the office - today's attendance is marked Present.");
              } else if (r.optBoolean("already") || r.optBoolean("yearMismatch")) {
                sp.edit().putString("done", today()).apply();   // today is already filled (or the year is not the register's year): stop trying
              }
            } else if ("EXPIRED".equals(r.optString("code")) && !today().equals(sp.getString("warned", ""))) {
              sp.edit().putString("warned", today()).apply();
              notifyUser(c, 7311, "Geo-fence attendance paused", "Your login expired. Open the app once to turn it back on.");
            }
          } catch (Exception e) {
          } finally {
            pr.finish();
          }
        }
      }).start();
    }
  }

  /* phone restarted: the proximity alert is gone, set it again */
  public static class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent in) {
      start(c);
    }
  }
}
