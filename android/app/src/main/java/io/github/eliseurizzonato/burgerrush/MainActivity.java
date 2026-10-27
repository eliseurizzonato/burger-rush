package io.github.eliseurizzonato.burgerrush;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.google.android.gms.games.PlayGamesSdk;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlayGamesSavesPlugin.class);
        super.onCreate(savedInstanceState);
        PlayGamesSdk.initialize(this);
    }
}
