package com.outlawshopsystems.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int CAMERA_PERMISSION_REQUEST = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Request Camera Permission on Android startup if needed
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
        }

        try {
            WebView webView = this.getBridge().getWebView();
            if (webView != null) {
                webView.addJavascriptInterface(new OutlawPrintInterface(this, webView), "AndroidNativePrinter");
                
                // Ensure WebView grants camera / audio WebRTC permission requests
                webView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onPermissionRequest(final PermissionRequest request) {
                        MainActivity.this.runOnUiThread(() -> {
                            if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                                request.grant(request.getResources());
                            } else {
                                ActivityCompat.requestPermissions(MainActivity.this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
                                request.grant(request.getResources());
                            }
                        });
                    }
                });
            }
        } catch (Exception e) {
            e.printStackTrace();
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
    }
}
