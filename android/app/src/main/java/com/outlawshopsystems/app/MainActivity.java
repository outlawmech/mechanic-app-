package com.outlawshopsystems.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.FileProvider;
import androidx.activity.OnBackPressedCallback;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;

public class MainActivity extends BridgeActivity {
    private static final int CAMERA_PERMISSION_REQUEST = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Request Camera Permission on Android startup if needed
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
        }

        // Intercept Android hardware & gesture back button for in-app navigation
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            private long lastBackPressTime = 0;

            @Override
            public void handleOnBackPressed() {
                try {
                    WebView webView = (getBridge() != null) ? getBridge().getWebView() : null;
                    if (webView != null) {
                        webView.evaluateJavascript(
                            "(function() {" +
                            "  var closeBtn = document.querySelector('[data-modal-close=\"true\"]');" +
                            "  if (closeBtn) { closeBtn.click(); return 'modal'; }" +
                            "  if (window.location.pathname !== '/' && window.location.pathname !== '') {" +
                            "    window.history.back(); return 'nav';" +
                            "  }" +
                            "  return 'root';" +
                            "})()",
                            new ValueCallback<String>() {
                                @Override
                                public void onReceiveValue(String value) {
                                    if ("\"root\"".equals(value) || value == null || "null".equals(value)) {
                                        long now = System.currentTimeMillis();
                                        if (now - lastBackPressTime < 2000) {
                                            // Second tap within 2 seconds: minimize app smoothly
                                            moveTaskToBack(true);
                                        } else {
                                            lastBackPressTime = now;
                                            android.widget.Toast.makeText(
                                                MainActivity.this,
                                                "Tap back again to exit Outlaw Shop Systems",
                                                android.widget.Toast.LENGTH_SHORT
                                            ).show();
                                        }
                                    }
                                }
                            }
                        );
                        return;
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }

                long now = System.currentTimeMillis();
                if (now - lastBackPressTime < 2000) {
                    moveTaskToBack(true);
                } else {
                    lastBackPressTime = now;
                    android.widget.Toast.makeText(
                        MainActivity.this,
                        "Tap back again to exit Outlaw Shop Systems",
                        android.widget.Toast.LENGTH_SHORT
                    ).show();
                }
            }
        });

        try {
            WebView webView = this.getBridge().getWebView();
            if (webView != null) {
                webView.addJavascriptInterface(new OutlawPrintInterface(this, webView), "AndroidNativePrinter");
                webView.addJavascriptInterface(new OutlawFlashlightInterface(this), "AndroidNativeFlashlight");
                webView.addJavascriptInterface(new OutlawAppUpdateInterface(this), "AndroidNativeAppUpdater");
                
                // Capacitor's BridgeWebChromeClient handles camera permission and
                // photo/file selection. Replacing it breaks capture inputs.
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static class OutlawFlashlightInterface {
        private final Context context;

        public OutlawFlashlightInterface(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public boolean setTorch(boolean enabled) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    CameraManager cameraManager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
                    if (cameraManager != null) {
                        String[] ids = cameraManager.getCameraIdList();
                        for (String id : ids) {
                            try {
                                android.hardware.camera2.CameraCharacteristics characteristics = cameraManager.getCameraCharacteristics(id);
                                Boolean hasFlash = characteristics.get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE);
                                if (hasFlash != null && hasFlash) {
                                    cameraManager.setTorchMode(id, enabled);
                                    return true;
                                }
                            } catch (Exception ignored) {
                            }
                        }
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            return false;
        }
    }

    public static class OutlawAppUpdateInterface {
        private final MainActivity activity;

        public OutlawAppUpdateInterface(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public int getVersionCode() {
            try {
                PackageInfo packageInfo = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? (int) packageInfo.getLongVersionCode()
                    : packageInfo.versionCode;
            } catch (PackageManager.NameNotFoundException e) {
                return 0;
            }
        }

        @JavascriptInterface
        public void openLatestApk() {
            activity.runOnUiThread(() -> {
                try {
                    Uri apkUri = Uri.parse("https://github.com/outlawmech/mechanic-app-/releases/download/android-apk-latest/OutlawShopSystems-v1.0.apk");
                    activity.startActivity(new Intent(Intent.ACTION_VIEW, apkUri));
                } catch (Exception e) {
                    android.widget.Toast.makeText(activity, "Could not open the APK download page", android.widget.Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    public static class OutlawPrintInterface {
        private final MainActivity activity;
        private final WebView currentWebView;

        public OutlawPrintInterface(MainActivity activity, WebView webView) {
            this.activity = activity;
            this.currentWebView = webView;
        }

        @JavascriptInterface
        public void printInvoice(String jobName) {
            activity.runOnUiThread(() -> {
                try {
                    PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                    if (printManager != null) {
                        String name = (jobName != null && !jobName.trim().isEmpty()) ? jobName : "Outlaw_Invoice";
                        PrintDocumentAdapter printAdapter = currentWebView.createPrintDocumentAdapter(name);
                        
                        PrintAttributes.Builder builder = new PrintAttributes.Builder();
                        builder.setMediaSize(PrintAttributes.MediaSize.NA_LETTER);
                        builder.setResolution(new PrintAttributes.Resolution("doc", "Outlaw Spooler", 300, 300));
                        builder.setMinMargins(PrintAttributes.Margins.NO_MARGINS);
                        
                        printManager.print(name, printAdapter, builder.build());
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void printInvoiceHtml(String htmlContent, String jobName) {
            activity.runOnUiThread(() -> {
                try {
                    WebView printWebView = new WebView(activity);
                    printWebView.getSettings().setJavaScriptEnabled(false);
                    printWebView.setWebViewClient(new WebViewClient() {
                        @Override
                        public void onPageFinished(WebView view, String url) {
                            try {
                                PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                                if (printManager != null) {
                                    String name = (jobName != null && !jobName.trim().isEmpty()) ? jobName : "Outlaw_Invoice";
                                    PrintDocumentAdapter printAdapter = printWebView.createPrintDocumentAdapter(name);
                                    
                                    PrintAttributes.Builder builder = new PrintAttributes.Builder();
                                    builder.setMediaSize(PrintAttributes.MediaSize.NA_LETTER);
                                    builder.setResolution(new PrintAttributes.Resolution("doc", "Outlaw Spooler", 300, 300));
                                    builder.setMinMargins(PrintAttributes.Margins.NO_MARGINS);
                                    
                                    printManager.print(name, printAdapter, builder.build());
                                }
                            } catch (Exception e) {
                                e.printStackTrace();
                            }
                        }
                    });
                    printWebView.loadDataWithBaseURL("https://localhost", htmlContent, "text/html", "UTF-8", null);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void shareCsvFile(String base64Content, String requestedName) {
            activity.runOnUiThread(() -> {
                try {
                    String safeName = (requestedName == null ? "Purchase_Order.csv" : requestedName)
                        .replaceAll("[^A-Za-z0-9._-]", "_");
                    if (!safeName.toLowerCase().endsWith(".csv")) safeName += ".csv";
                    File exportDir = new File(activity.getCacheDir(), "po_exports");
                    if (!exportDir.exists() && !exportDir.mkdirs()) throw new Exception("Could not create export file.");
                    File exportFile = new File(exportDir, safeName);
                    byte[] content = Base64.decode(base64Content, Base64.DEFAULT);
                    try (FileOutputStream output = new FileOutputStream(exportFile)) {
                        output.write(content);
                    }
                    Uri contentUri = FileProvider.getUriForFile(
                        activity,
                        activity.getPackageName() + ".fileprovider",
                        exportFile
                    );
                    Intent shareIntent = new Intent(Intent.ACTION_SEND);
                    shareIntent.setType("text/csv");
                    shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                    shareIntent.putExtra(Intent.EXTRA_SUBJECT, safeName);
                    shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    activity.startActivity(Intent.createChooser(shareIntent, "Export Purchase Order"));
                } catch (Exception e) {
                    e.printStackTrace();
                    android.widget.Toast.makeText(activity, "Could not export Purchase Order CSV", android.widget.Toast.LENGTH_LONG).show();
                }
            });
        }
    }
}
