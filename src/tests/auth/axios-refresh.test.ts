import axios from "axios";
import Cookies from "js-cookie";
import {
  extractRefreshTokens,
  refreshAccessToken,
} from "@/lib/api/axiosInstance";

jest.mock("js-cookie", () => ({
  get: jest.fn(),
  set: jest.fn(),
  remove: jest.fn(),
}));

const getMock = Cookies.get as jest.Mock;
const setMock = Cookies.set as jest.Mock;
const removeMock = Cookies.remove as jest.Mock;
const axiosPost = jest.spyOn(axios, "post");

// Shape actually returned by the API (wrapped by the global ResponseInterceptor)
const wrappedBody = {
  success: true,
  message: "Operation completed successfully",
  data: {
    accessToken: "new-access",
    refreshToken: "new-refresh",
    expiresIn: 86400,
    tokenType: "Bearer",
  },
};

afterAll(() => jest.restoreAllMocks());

describe("extractRefreshTokens", () => {
  it("unwraps the ResponseInterceptor envelope", () => {
    expect(extractRefreshTokens(wrappedBody)).toEqual({
      accessToken: "new-access",
      refreshToken: "new-refresh",
    });
  });

  it("accepts a bare token payload", () => {
    expect(
      extractRefreshTokens({ accessToken: "a", refreshToken: "r" }),
    ).toEqual({ accessToken: "a", refreshToken: "r" });
  });

  it("rejects malformed payloads", () => {
    expect(extractRefreshTokens(undefined)).toBeNull();
    expect(extractRefreshTokens({})).toBeNull();
    expect(extractRefreshTokens({ message: "ok" })).toBeNull();
    expect(extractRefreshTokens({ data: { accessToken: "a" } })).toBeNull();
  });
});

describe("refreshAccessToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getMock.mockReturnValue("old-refresh");
  });

  it("stores the unwrapped tokens and returns true", async () => {
    axiosPost.mockResolvedValueOnce({ data: wrappedBody });

    await expect(refreshAccessToken()).resolves.toBe(true);

    expect(setMock).toHaveBeenCalledWith(
      "authToken",
      "new-access",
      expect.anything(),
    );
    expect(setMock).toHaveBeenCalledWith(
      "refreshToken",
      "new-refresh",
      expect.anything(),
    );
  });

  it("fails and clears tokens when the response is malformed", async () => {
    axiosPost.mockResolvedValueOnce({ data: { message: "ok" } });

    await expect(refreshAccessToken()).resolves.toBe(false);

    expect(removeMock).toHaveBeenCalledWith("authToken");
    expect(removeMock).toHaveBeenCalledWith("refreshToken");
  });

  it("fails without calling the API when no refresh token cookie exists", async () => {
    getMock.mockReturnValue(undefined);

    await expect(refreshAccessToken()).resolves.toBe(false);
    expect(axiosPost).not.toHaveBeenCalled();
  });
});
