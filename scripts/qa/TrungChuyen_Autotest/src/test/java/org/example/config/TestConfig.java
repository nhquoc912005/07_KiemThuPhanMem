package org.example.config;

public final class TestConfig {
    private TestConfig() {
    }

    public static final String BASE_URL = get("BASE_URL", "http://localhost:3000");
    public static final String DRIVER_USERNAME = get("DRIVER_USERNAME", "taixe1");
    public static final String DRIVER_PASSWORD = get("DRIVER_PASSWORD", "123456");
    public static final String NO_TRIP_USERNAME = get("NO_TRIP_USERNAME", "dieuphoi1");
    public static final String NO_TRIP_PASSWORD = get("NO_TRIP_PASSWORD", "123456");
    public static final String BROWSER = get("BROWSER", "chrome");

    public static final int TIMEOUT_SECONDS = Integer.parseInt(get("TIMEOUT_SECONDS", "15"));

    private static String get(String key, String defaultValue) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        return value;
    }
}
