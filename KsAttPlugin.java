package ks.att;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Scanner;

/* Attendance reminder that works WITHOUT opening the app.
   - The app hands over the reminder times (and the login it already has) with schedule().
   - Android's alarm clock wakes FireReceiver at each time -> a notification with two buttons (Present / Absent).
   - A button goes to MarkReceiver, which sends the attendance to the server in the background and shows "Marked ✓". */
@CapacitorPlugin(name = "KsAtt")
public class KsAttPlugin extends Plugin {
  static final String PREFS = "ks_att";
  static final String CH = "att_reminder2";

  static int flags() {
    int f = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= 23) f |= PendingIntent.FLAG_IMMUTABLE;
    return f;
  }

  static void channel(Context c) {
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
      NotificationChannel ch = new NotificationChannel(CH, "Attendance reminder", NotificationManager.IMPORTANCE_HIGH);
      ch.setDescription("Daily reminder to mark attendance");
      ch.enableVibration(true);
      nm.createNotificationChannel(ch);
    }
  }

  static int icon(Context c) {
    int ic = c.getResources().getIdentifier("ic_stat_notify", "drawable", c.getPackageName());
    if (ic == 0) ic = c.getApplicationInfo().icon;
    return ic;
  }

  static Notification.Builder builder(Context c) {
    channel(c);
    Notification.Builder b;
    if (Build.VERSION.SDK_INT >= 26) b = new Notification.Builder(c, CH);
    else {
      b = new Notification.Builder(c);
      b.setPriority(Notification.PRIORITY_HIGH);
      b.setDefaults(Notification.DEFAULT_ALL);
    }
    b.setSmallIcon(icon(c));
    b.setAutoCancel(true);
    Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
    if (open != null) b.setContentIntent(PendingIntent.getActivity(c, 0, open, flags()));
    return b;
  }

  static PendingIntent alarmIntent(Context c, int id, JSONObject o) {
    Intent i = new Intent(c, FireReceiver.class);
    if (o != null) {
      i.putExtra("id", id);
      i.putExtra("y", o.optInt("y"));
      i.putExtra("m", o.optInt("m"));
      i.putExtra("d", o.optInt("d"));
      i.putExtra("title", o.optString("title", "Attendance reminder"));
      i.putExtra("body", o.optString("body", "Tap Present or Absent."));
    }
    return PendingIntent.getBroadcast(c, id, i, flags());
  }

  static void setAlarm(Context c, long at, PendingIntent pi) {
    AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    else if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    else am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
  }

  static void cancelStored(Context c) {
    try {
      SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      JSONArray arr = new JSONArray(sp.getString("items", "[]"));
      AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
      NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
      for (int k = 0; k < arr.length(); k++) {
        int id = arr.getJSONObject(k).optInt("id");
        am.cancel(alarmIntent(c, id, null));
        nm.cancel(id);
      }
    } catch (Exception e) {}
  }

  static void scheduleStored(Context c) {
    try {
      SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      JSONArray arr = new JSONArray(sp.getString("items", "[]"));
      long now = System.currentTimeMillis();
      for (int k = 0; k < arr.length(); k++) {
        JSONObject o = arr.getJSONObject(k);
        long at = o.optLong("at");
        if (at <= now) continue;
        setAlarm(c, at, alarmIntent(c, o.optInt("id"), o));
      }
    } catch (Exception e) {}
  }

  @PluginMethod
  public void schedule(PluginCall call) {
    try {
      Context c = getContext();
      cancelStored(c);
      String items = "[]";
      if (call.getArray("items") != null) items = call.getArray("items").toString();
      SharedPreferences.Editor ed = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
      ed.putString("items", items);
      ed.putString("api", call.getString("api", ""));
      ed.putString("token", call.getString("token", ""));
      ed.putString("asUser", call.getString("asUser", ""));
      ed.putString("emp", call.getString("emp", ""));
      ed.apply();
      scheduleStored(c);
      JSObject res = new JSObject();
      res.put("count", new JSONArray(items).length());
      call.resolve(res);
    } catch (Exception e) {
      call.reject("Could not schedule: " + e.getMessage());
    }
  }

  @PluginMethod
  public void test(PluginCall call) {
    try {
      Context c = getContext();
      JSONObject o = new JSONObject();
      o.put("y", call.getInt("y", 0));
      o.put("m", call.getInt("m", 0));
      o.put("d", call.getInt("d", 0));
      o.put("title", "Attendance reminder (test)");
      o.put("body", "Tap Present or Absent to mark today.");
      setAlarm(c, System.currentTimeMillis() + 5000, alarmIntent(c, 7190, o));
      call.resolve();
    } catch (Exception e) {
      call.reject("Could not send the test: " + e.getMessage());
    }
  }

  /* alarm time reached -> show the notification with the two buttons */
  public static class FireReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent in) {
      try {
        int id = in.getIntExtra("id", 7190);
        Notification.Builder b = builder(c);
        b.setContentTitle(in.getStringExtra("title"));
        b.setContentText(in.getStringExtra("body"));
        b.addAction(0, "✅ Present", markIntent(c, in, id, "P"));
        b.addAction(0, "❌ Absent", markIntent(c, in, id, "A"));
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(id, b.build());
      } catch (Exception e) {}
    }

    private PendingIntent markIntent(Context c, Intent in, int id, String code) {
      Intent i = new Intent(c, MarkReceiver.class);
      i.putExtra("id", id);
      i.putExtra("y", in.getIntExtra("y", 0));
      i.putExtra("m", in.getIntExtra("m", 0));
      i.putExtra("d", in.getIntExtra("d", 0));
      i.putExtra("code", code);
      return PendingIntent.getBroadcast(c, id * 10 + ("P".equals(code) ? 1 : 2), i, flags());
    }
  }

  /* a button was tapped -> send the attendance to the server without opening the app */
  public static class MarkReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(final Context c, final Intent in) {
      final PendingResult pr = goAsync();
      new Thread(new Runnable() {
        @Override
        public void run() {
          String err = "";
          int id = in.getIntExtra("id", 7190);
          String code = in.getStringExtra("code");
          try {
            SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String api = sp.getString("api", ""), token = sp.getString("token", "");
            if (api.length() == 0 || token.length() == 0) throw new Exception("Not signed in");
            JSONObject body = new JSONObject();
            body.put("action", "setAttendance");
            body.put("token", token);
            String asUser = sp.getString("asUser", ""), emp = sp.getString("emp", "");
            if (asUser.length() > 0) body.put("asUser", asUser);
            if (emp.length() > 0) body.put("emp", emp);
            JSONArray en = new JSONArray();
            JSONObject e1 = new JSONObject();
            e1.put("month", in.getIntExtra("m", 0));
            e1.put("day", in.getIntExtra("d", 0));
            e1.put("code", code);
            en.put(e1);
            body.put("entries", en);
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
            if (!r.optBoolean("ok")) {
              err = r.optString("error", "Server said no");
              if ("EXPIRED".equals(r.optString("code"))) err = "Session expired";
            }
          } catch (Exception e) {
            err = (e.getMessage() == null || e.getMessage().length() == 0) ? "No internet" : e.getMessage();
          }
          try {
            String word = "P".equals(code) ? "Present" : "Absent";
            Notification.Builder b = builder(c);
            if (err.length() == 0) {
              b.setContentTitle("Attendance marked ✓");
              b.setContentText(word + " for " + in.getIntExtra("d", 0) + "/" + in.getIntExtra("m", 0));
            } else {
              b.setContentTitle("Could not mark " + word);
              b.setContentText(err + ". Tap to open the app and mark it.");
            }
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.notify(id, b.build());
          } catch (Exception e) {}
          pr.finish();
        }
      }).start();
    }
  }

  /* after a restart (or an app update) Android forgets the alarms: set them again */
  public static class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent in) {
      scheduleStored(c);
    }
  }
}
