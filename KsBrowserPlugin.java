package ks.browser;

import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/* KS · Capacitor plugin "KsBrowser": opens the in-app private browser (AdGuard DNS filtering). */
@CapacitorPlugin(name = "KsBrowser")
public class KsBrowserPlugin extends Plugin {

  @PluginMethod
  public void open(PluginCall call) {
    Intent i = new Intent(getContext(), KsBrowserActivity.class);
    i.putExtra("url", call.getString("url", "https://duckduckgo.com"));
    i.putExtra("dns", call.getString("dns", ""));
    getActivity().startActivity(i);
    call.resolve();
  }

  @PluginMethod
  public void openNetworkSettings(PluginCall call) {
    try {
      Intent i = new Intent(Settings.ACTION_WIRELESS_SETTINGS);
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
      call.resolve();
    } catch (Exception e) {
      call.reject("Could not open settings");
    }
  }
}
