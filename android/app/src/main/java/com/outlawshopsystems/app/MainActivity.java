package com.outlawshopsystems.app;

import android.content.Context;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        try {
            WebView webView = this.getBridge().getWebView();
            if (webView != null) {
                webView.addJavascriptInterface(new OutlawPrintInterface(this, webView), "AndroidNativePrinter");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static class OutlawPrintInterface {
        private final MainActivity activity;
        private final WebView webView;

        public OutlawPrintInterface(MainActivity activity, WebView webView) {
            this.activity = activity;
            this.webView = webView;
        }

        @JavascriptInterface
        public void printInvoice(String jobName) {
            activity.runOnUiThread(() -> {
                try {
                    PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                    if (printManager != null) {
                        String name = (jobName != null && !jobName.trim().isEmpty()) ? jobName : "Outlaw_Invoice";
                        PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter(name);
                        printManager.print(name, printAdapter, new PrintAttributes.Builder().build());
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
    }
}
