import { StatusBar } from "expo-status-bar";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Linking,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Recipe = {
  id: string;
  name: string;
  category?: string;
  area?: string;
  instructions?: string;
  ingredients: string[];
  image?: string;
  tags?: string[];
  source?: string;
};

type MealFromApi = {
  idMeal: string;
  strMeal: string;
  strCategory: string | null;
  strArea: string | null;
  strInstructions: string | null;
  strMealThumb: string | null;
  strTags: string | null;
  strSource: string | null;
  [key: string]: string | null;
};

const API_URL = "https://www.themealdb.com/api/json/v1/1/search.php?s=";
const INGREDIENT_RANGE = Array.from({ length: 20 }, (_, index) => index + 1);

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const createResponsiveTextStyles = (scale: number) => ({
  title: { fontSize: 28 * scale },
  subtitle: { fontSize: 15 * scale },
  search: { fontSize: 16 * scale },
  cardImagePlaceholderText: { fontSize: 14 * scale },
  badge: { fontSize: 12 * scale },
  badgeSecondary: { fontSize: 12 * scale },
  recipeName: { fontSize: 20 * scale },
  recipeDescription: {
    fontSize: 14 * scale,
    lineHeight: 21 * scale,
  },
  recipeMeta: { fontSize: 13 * scale },
  loadingText: { fontSize: 14 * scale },
  errorText: { fontSize: 16 * scale },
  retryButtonText: { fontSize: 15 * scale },
  emptyStateTitle: { fontSize: 18 * scale },
  emptyStateSubtitle: { fontSize: 14 * scale },
  modalTitle: { fontSize: 30 * scale },
  modalMeta: { fontSize: 14 * scale },
  tagPill: { fontSize: 12 * scale },
  sourceButtonText: { fontSize: 14 * scale },
  sectionTitle: { fontSize: 18 * scale },
  listItem: {
    fontSize: 15 * scale,
    lineHeight: 24 * scale,
  },
  closeButtonText: { fontSize: 16 * scale },
});

const mapMealToRecipe = (meal: MealFromApi): Recipe => {
  const ingredients = INGREDIENT_RANGE.map((position) => {
    const ingredient = meal[`strIngredient${position}`];
    const measure = meal[`strMeasure${position}`];

    if (!ingredient || !ingredient.trim()) {
      return null;
    }

    const cleanIngredient = ingredient.trim();
    const cleanMeasure = measure?.trim();

    return cleanMeasure && cleanMeasure !== "0"
      ? `${cleanMeasure} ${cleanIngredient}`
      : cleanIngredient;
  }).filter((value): value is string => Boolean(value));

  return {
    id: meal.idMeal,
    name: meal.strMeal,
    category: meal.strCategory ?? undefined,
    area: meal.strArea ?? undefined,
    instructions: meal.strInstructions ?? undefined,
    ingredients,
    image: meal.strMealThumb ?? undefined,
    tags: meal.strTags
      ?.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    source: meal.strSource ?? undefined,
  };
};

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const initialLoadRef = useRef(true);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width } = useWindowDimensions();
  const fontScale = useMemo(() => clamp(width / 375, 0.85, 1.25), [width]);
  const responsiveText = useMemo(
    () => createResponsiveTextStyles(fontScale),
    [fontScale]
  );

  const loadRecipes = useCallback(async (term: string) => {
    try {
      setErrorMessage(null);
      const response = await fetch(`${API_URL}${encodeURIComponent(term)}`, {
        headers: { "Cache-Control": "no-cache" },
      });

      if (!response.ok) {
        throw new Error(
          `Unable to reach recipe service (status ${response.status})`
        );
      }

      const payload = await response.json();
      const meals = payload?.meals;

      if (meals === null) {
        setRecipes([]);
        return;
      }

      if (!Array.isArray(meals)) {
        throw new Error("Recipe data malformed: missing meals array.");
      }

      const mappedRecipes = meals.map(mapMealToRecipe);
      setRecipes(mappedRecipes);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected error while fetching recipes.";
      setErrorMessage(message);
      throw error;
    }
  }, []);

  const fetchAndTrack = useCallback(
    async (term: string) => {
      setStatus("loading");
      try {
        await loadRecipes(term);
        setStatus("idle");
      } catch {
        setStatus("error");
      }
    },
    [loadRecipes]
  );

  useEffect(() => {
    fetchAndTrack("");
  }, [fetchAndTrack]);

  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetchAndTrack(query.trim());
    }, 450);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, fetchAndTrack]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAndTrack(query.trim()).finally(() => setRefreshing(false));
  }, [fetchAndTrack, query]);

  const renderRecipe = useCallback(({ item }: { item: Recipe }) => {
    const preview = item.instructions
      ? item.instructions.replace(/\s+/g, " ").trim()
      : "";

    return (
      <TouchableOpacity
        accessibilityLabel={`View details for ${item.name}`}
        activeOpacity={0.8}
        onPress={() => setSelectedRecipe(item)}
        style={styles.card}
      >
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Text
              style={[
                styles.cardImagePlaceholderText,
                responsiveText.cardImagePlaceholderText,
              ]}
            >
              Yummy delights
            </Text>
          </View>
        )}

        <View style={styles.cardBody}>
          <View style={styles.badgeRow}>
            {item.area ? (
              <Text style={[styles.badge, responsiveText.badge]}>
                {item.area}
              </Text>
            ) : null}
            {item.category ? (
              <Text
                style={[styles.badgeSecondary, responsiveText.badgeSecondary]}
              >
                {item.category}
              </Text>
            ) : null}
          </View>

          <Text style={[styles.recipeName, responsiveText.recipeName]}>
            {item.name}
          </Text>

          {preview ? (
            <Text
              style={[
                styles.recipeDescription,
                responsiveText.recipeDescription,
              ]}
              numberOfLines={2}
            >
              {preview}
            </Text>
          ) : null}

          {item.ingredients.length ? (
            <Text
              style={[styles.recipeMeta, responsiveText.recipeMeta]}
              numberOfLines={1}
            >
              Top ingredients: {item.ingredients.slice(0, 3).join(", ")}
              {item.ingredients.length > 3 ? "…" : ""}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }, []);

  const keyExtractor = useCallback((item: Recipe) => item.id, []);

  const preparationSteps = useMemo(() => {
    if (!selectedRecipe?.instructions) {
      return [] as string[];
    }

    return selectedRecipe.instructions
      .split(/\r?\n+/)
      .map((step) => step.replace(/^\d+[).]\s*/, "").trim())
      .filter(Boolean);
  }, [selectedRecipe]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <RNStatusBar barStyle="dark-content" />
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={[styles.title, responsiveText.title]}>
          Grace and Alex Recipe Book
        </Text>
        <Text style={[styles.subtitle, responsiveText.subtitle]}>
          Sip & savor pretty plates from around the world.
        </Text>
        <TextInput
          accessibilityLabel="Search for recipes"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search dreamy dishes"
          placeholderTextColor="rgba(83,18,43,0.45)"
          returnKeyType="search"
          style={[styles.search, responsiveText.search]}
          value={query}
        />
      </View>

      {status === "loading" && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#ff66a6" />
          <Text style={[styles.loadingText, responsiveText.loadingText]}>
            Whisking up delicious ideas…
          </Text>
        </View>
      ) : null}

      {status === "error" && errorMessage ? (
        <View style={styles.centered}>
          <Text style={[styles.errorText, responsiveText.errorText]}>
            {errorMessage}
          </Text>
          <TouchableOpacity
            onPress={() => fetchAndTrack(query.trim())}
            style={styles.retryButton}
          >
            <Text
              style={[styles.retryButtonText, responsiveText.retryButtonText]}
            >
              Try again
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={
          recipes.length ? styles.listContent : styles.emptyListContent
        }
        data={recipes}
        keyExtractor={keyExtractor}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ff66a6"
            colors={["#ff66a6"]}
          />
        }
        renderItem={renderRecipe}
        ListEmptyComponent={
          status !== "loading" && status !== "error" ? (
            <View style={styles.centered}>
              <Text
                style={[styles.emptyStateTitle, responsiveText.emptyStateTitle]}
              >
                No recipes found
              </Text>
              <Text
                style={[
                  styles.emptyStateSubtitle,
                  responsiveText.emptyStateSubtitle,
                ]}
              >
                Try a different search or clear the filter.
              </Text>
            </View>
          ) : null
        }
      />

      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedRecipe(null)}
        presentationStyle="fullScreen"
        transparent={false}
        visible={Boolean(selectedRecipe)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {selectedRecipe?.image ? (
              <Image
                source={{ uri: selectedRecipe.image }}
                style={styles.modalImage}
              />
            ) : null}

            <Text style={[styles.modalTitle, responsiveText.modalTitle]}>
              {selectedRecipe?.name}
            </Text>

            <View style={styles.modalMetaRow}>
              {selectedRecipe?.area ? (
                <Text style={[styles.modalMeta, responsiveText.modalMeta]}>
                  Cuisine · {selectedRecipe.area}
                </Text>
              ) : null}
              {selectedRecipe?.category ? (
                <Text style={[styles.modalMeta, responsiveText.modalMeta]}>
                  Category · {selectedRecipe.category}
                </Text>
              ) : null}
            </View>

            {selectedRecipe?.tags?.length ? (
              <View style={styles.tagRow}>
                {selectedRecipe.tags.map((tag) => (
                  <Text
                    key={tag}
                    style={[styles.tagPill, responsiveText.tagPill]}
                  >
                    #{tag}
                  </Text>
                ))}
              </View>
            ) : null}

            {selectedRecipe?.source ? (
              <TouchableOpacity
                accessibilityRole="link"
                onPress={() =>
                  selectedRecipe.source &&
                  Linking.openURL(selectedRecipe.source)
                }
                style={styles.sourceButton}
              >
                <Text
                  style={[
                    styles.sourceButtonText,
                    responsiveText.sourceButtonText,
                  ]}
                >
                  Open full recipe
                </Text>
              </TouchableOpacity>
            ) : null}

            {selectedRecipe?.ingredients?.length ? (
              <View style={styles.section}>
                <Text
                  style={[styles.sectionTitle, responsiveText.sectionTitle]}
                >
                  Ingredients
                </Text>
                {selectedRecipe.ingredients.map((ingredient, index) => (
                  <Text
                    key={`${ingredient}-${index}`}
                    style={[styles.listItem, responsiveText.listItem]}
                  >
                    • {ingredient}
                  </Text>
                ))}
              </View>
            ) : null}

            {preparationSteps.length ? (
              <View style={styles.section}>
                <Text
                  style={[styles.sectionTitle, responsiveText.sectionTitle]}
                >
                  Preparation
                </Text>
                {preparationSteps.map((step, index) => (
                  <Text
                    key={`${index}-${step}`}
                    style={[styles.listItem, responsiveText.listItem]}
                  >
                    {index + 1}. {step}
                  </Text>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <TouchableOpacity
            onPress={() => setSelectedRecipe(null)}
            style={styles.closeButton}
          >
            <Text
              style={[styles.closeButtonText, responsiveText.closeButtonText]}
            >
              Close
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff5f8",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 18,
    backgroundColor: "#ffe3ef",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: "#ffb6d9",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#53122b",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "#8c3b63",
    marginTop: 6,
  },
  search: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "#fff5f8",
    borderRadius: 16,
    borderColor: "#f8a1c4",
    borderWidth: 1,
    fontSize: 16,
    color: "#53122b",
    shadowColor: "#ffb6d9",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 82,
  },
  emptyListContent: {
    flexGrow: 1,
    padding: 32,
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 20,
    shadowColor: "#ffb6d9",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  cardImage: {
    width: "100%",
    height: 160,
  },
  cardImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffeaf3",
  },
  cardImagePlaceholderText: {
    color: "#c0528f",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  cardBody: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  badge: {
    backgroundColor: "#ffe0f1",
    color: "#c62368",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    marginRight: 8,
    marginBottom: 6,
  },
  badgeSecondary: {
    backgroundColor: "#fbe7ff",
    color: "#a4307c",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "600",
    marginRight: 8,
    marginBottom: 6,
  },
  recipeName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#53122b",
    marginBottom: 10,
  },
  recipeDescription: {
    fontSize: 14,
    color: "#8c3b63",
    lineHeight: 21,
  },
  recipeMeta: {
    fontSize: 13,
    color: "#a14b79",
    marginTop: 12,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    color: "#c62368",
    fontWeight: "500",
  },
  errorText: {
    fontSize: 16,
    color: "#ff4d94",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#ff66a6",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: "#ffb6d9",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  retryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#c62368",
    marginBottom: 6,
    textAlign: "center",
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: "#a14b79",
    textAlign: "center",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff5f8",
  },
  modalContent: {
    padding: 24,
    paddingBottom: 48,
  },
  modalImage: {
    width: "100%",
    height: 240,
    borderRadius: 22,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#53122b",
    marginBottom: 12,
  },
  modalMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  modalMeta: {
    fontSize: 14,
    color: "#a14b79",
    marginRight: 12,
    marginBottom: 6,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginVertical: 6,
  },
  tagPill: {
    backgroundColor: "#ffeaf3",
    color: "#c62368",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "600",
    marginRight: 8,
    marginBottom: 8,
  },
  sourceButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ffe3ef",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 4,
    marginBottom: 18,
  },
  sourceButtonText: {
    color: "#c62368",
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#53122b",
    marginBottom: 10,
  },
  listItem: {
    fontSize: 15,
    color: "#8c3b63",
    lineHeight: 24,
    marginBottom: 6,
  },
  closeButton: {
    backgroundColor: "#ff66a6",
    margin: 24,
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
    shadowColor: "#ffb6d9",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  closeButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
