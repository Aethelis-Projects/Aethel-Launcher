public class Gen {
    public static void main(String[] args) {
        String[] names = {"Steve", "steve", "Alex", "alex", "Notch", "Player", "Иван"};
        for (String n : names) {
            System.out.println("OfflinePlayer:" + n + " "
                + java.util.UUID.nameUUIDFromBytes(
                    ("OfflinePlayer:" + n).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        }
    }
}