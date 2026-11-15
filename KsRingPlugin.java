package ks.ring;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

/* Your own call ringtone for notifications that arrive while the app is closed.
   Android plays the sound of a notification channel, so the uploaded file is saved to the phone's Notifications sounds
   and a call channel that uses it is created. The channel name is given back to the app, which tells the server to use it for this phone. */
@CapacitorPlugin(name = "KsRing")
public class KsRingPlugin extends Plugin {
  private static final String PREFIX = "calls_c_";
  private static final String FILE_PREFIX = "ks_call_";

  private static String safe(String s) {
    if (s == null) return "";
    String r = s.replaceAll("[^A-Za-z0-9]", "");
    return r.length() > 24 ? r.substring(0, 24) : r;
  }

  private void removeOld(Context ctx) {
    try {
      if (Build.VERSION.SDK_INT >= 26) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        for (NotificationChannel c : nm.getNotificationChannels()) {
          if (c.getId().startsWith(PREFIX)) nm.deleteNotificationChannel(c.getId());
        }
      }
    } catch (Exception e) {}
    try {
      if (Build.VERSION.SDK_INT >= 29) {
        ctx.getContentResolver().delete(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
          MediaStore.MediaColumns.DISPLAY_NAME + " LIKE ?", new String[] { FILE_PREFIX + "%" });
      }
    } catch (Exception e) {}
  }

  @PluginMethod
  public void setCallTone(PluginCall call) {
    try {
      if (Build.VERSION.SDK_INT < 29) { call.reject("Needs Android 10 or newer"); return; }
      String data = call.getString("data");
      String id = safe(call.getString("id"));
      String mime = call.getString("mime");
      String ext = call.getString("ext");
      if (data == null || data.length() == 0 || id.length() == 0) { call.reject("No file"); return; }
      if (mime == null || !mime.startsWith("audio/")) mime = "audio/mpeg";
      if (ext == null || !ext.matches("[A-Za-z0-9]{1,5}")) ext = "mp3";
      byte[] bytes = Base64.decode(data, Base64.DEFAULT);
      Context ctx = getContext();
      removeOld(ctx);
      ContentResolver cr = ctx.getContentResolver();
      ContentValues v = new ContentValues();
      v.put(MediaStore.MediaColumns.DISPLAY_NAME, FILE_PREFIX + id + "." + ext);
      v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
      v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_NOTIFICATIONS);
      v.put(MediaStore.Audio.Media.IS_NOTIFICATION, 1);
      Uri uri = cr.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, v);
      if (uri == null) { call.reject("Could not save the sound"); return; }
      OutputStream os = cr.openOutputStream(uri);
      if (os == null) { call.reject("Could not save the sound"); return; }
      os.write(bytes);
      os.close();

      NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
      String chId = PREFIX + id;
      NotificationChannel ch = new NotificationChannel(chId, "Calls (your ringtone)", NotificationManager.IMPORTANCE_HIGH);
      ch.setDescription("Incoming voice and video calls");
      AudioAttributes aa = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build();
      ch.setSound(uri, aa);
      ch.enableVibration(true);
      ch.setVibrationPattern(new long[] { 0, 1000, 500, 1000, 500, 1000 });
      ch.enableLights(true);
      ch.setLockscreenVisibility(1);
      nm.createNotificationChannel(ch);

      JSObject res = new JSObject();
      res.put("channel", chId);
      call.resolve(res);
    } catch (Exception e) {
      call.reject("Could not set the ringtone: " + e.getMessage());
    }
  }

  @PluginMethod
  public void clearCallTone(PluginCall call) {
    try { removeOld(getContext()); } catch (Exception e) {}
    call.resolve();
  }
}
